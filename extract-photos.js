#!/usr/bin/env node

/**
 * Helper script to extract image URLs from Google Photos shared albums
 * 
 * This script helps extract direct image URLs from Google Photos shared links.
 * Run this with Node.js: node extract-photos.js
 * 
 * Note: Due to CORS and Google Photos security, you may need to:
 * 1. Use the Google Photos API (recommended)
 * 2. Or manually extract URLs from the album pages
 * 3. Or use a browser extension to export URLs
 */

const https = require('https');
const fs = require('fs');

const ALBUM_LINKS = [
    'https://photos.app.goo.gl/fzWXAYTjxVAJYk7o6',
    'https://photos.app.goo.gl/gFbq1VA5iEVqJmEz5'
];

/**
 * Extract image URLs from Google Photos album HTML
 * This is a basic attempt - Google Photos heavily uses JavaScript, so this may not work perfectly
 */
async function extractUrlsFromAlbum(albumUrl) {
    return new Promise((resolve, reject) => {
        https.get(albumUrl, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const items = [];
                
                // Try to find image URLs in the HTML
                // Google Photos uses baseUrl patterns like:
                // "https://lh3.googleusercontent.com/pw/..."
                const imageUrlRegex = /(https:\/\/lh3\.googleusercontent\.com[^\s"']+)/g;
                const videoUrlRegex = /(https:\/\/[^\s"']*\.(mp4|webm|mov)[^\s"']*)/gi;
                
                // Extract image URLs
                const imageMatches = data.match(imageUrlRegex) || [];
                const videoMatches = data.match(videoUrlRegex) || [];
                
                // Process images
                [...new Set(imageMatches)].forEach((url, index) => {
                    // Clean up URL (remove query parameters that might break it)
                    const cleanUrl = url.split('"')[0].split("'")[0].split('\\')[0];
                    items.push({
                        id: items.length + 1,
                        type: 'photo',
                        src: cleanUrl
                    });
                });
                
                // Process videos
                [...new Set(videoMatches)].forEach((url) => {
                    items.push({
                        id: items.length + 1,
                        type: 'video',
                        src: url
                    });
                });
                
                resolve(items);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Main extraction function
 */
async function main() {
    console.log('Extracting images from Google Photos albums...');
    console.log('Note: This may not work perfectly due to Google Photos JavaScript rendering.\n');
    
    const allItems = [];
    
    for (const albumUrl of ALBUM_LINKS) {
        console.log(`Processing: ${albumUrl}`);
        try {
            const items = await extractUrlsFromAlbum(albumUrl);
            console.log(`  Found ${items.length} items`);
            allItems.push(...items);
        } catch (error) {
            console.error(`  Error processing album: ${error.message}`);
        }
    }
    
    if (allItems.length === 0) {
        console.log('\n❌ Could not extract URLs automatically.');
        console.log('\nAlternative methods:');
        console.log('1. Use Google Photos API (see: https://developers.google.com/photos)');
        console.log('2. Manually visit the albums and use browser DevTools to extract image URLs');
        console.log('3. Use a browser extension like "Image Downloader" to export URLs');
        console.log('\nOnce you have URLs, save them to photos-data.json in this format:');
        console.log(JSON.stringify({
            items: [
                { id: 1, type: 'photo', src: 'https://example.com/image1.jpg' },
                { id: 2, type: 'video', src: 'https://example.com/video1.mp4' }
            ]
        }, null, 2));
        return;
    }
    
    // Save to JSON file
    const outputData = {
        drive1: ALBUM_LINKS[0],
        drive2: ALBUM_LINKS[1],
        items: allItems
    };
    
    fs.writeFileSync('photos-data.json', JSON.stringify(outputData, null, 2));
    console.log(`\n✅ Extracted ${allItems.length} items and saved to photos-data.json`);
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { extractUrlsFromAlbum };

