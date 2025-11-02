/**
 * Browser Console Script to Extract Google Photos URLs
 * 
 * Instructions:
 * 1. Open one of your Google Photos album pages in a browser:
 *    - https://photos.app.goo.gl/fzWXAYTjxVAJYk7o6
 *    - https://photos.app.goo.gl/gFbq1VA5iEVqJmEz5
 * 
 * 2. Open Browser DevTools (F12 or Cmd+Option+I)
 * 3. Go to Console tab
 * 4. Paste this entire script and press Enter
 * 5. Scroll through the album to load all images
 * 6. Run the extraction function: extractUrls()
 * 7. Copy the output and add it to photos-data.json
 */

function extractUrls() {
    const items = [];
    const seenUrls = new Set();
    
    // Method 1: Look for images in the DOM
    const images = document.querySelectorAll('img[src*="googleusercontent"], img[src*="google.com"]');
    images.forEach((img, index) => {
        let src = img.src || img.getAttribute('src') || '';
        
        // Clean up the URL - Google Photos URLs often have size parameters
        // Remove size parameters to get full resolution: =sXXX or =wXXX-hXXX
        src = src.replace(/[=]s\d+(-.*?)?($|&)/g, '');
        src = src.replace(/[=]w\d+-h\d+($|&)/g, '');
        src = src.replace(/[=]w\d+($|&)/g, '');
        src = src.split('?')[0]; // Remove query parameters if they break the URL
        
        // Only add if it's a Google Photos URL and we haven't seen it
        if (src.includes('googleusercontent.com') && !seenUrls.has(src)) {
            seenUrls.add(src);
            items.push({
                id: items.length + 1,
                type: 'photo',
                src: src
            });
        }
    });
    
    // Method 2: Look for video elements
    const videos = document.querySelectorAll('video source, video[src]');
    videos.forEach((video) => {
        const src = video.src || video.getAttribute('src') || '';
        if (src && !seenUrls.has(src)) {
            seenUrls.add(src);
            items.push({
                id: items.length + 1,
                type: 'video',
                src: src
            });
        }
    });
    
    // Method 3: Check Network requests stored in Performance API
    try {
        const entries = performance.getEntriesByType('resource');
        entries.forEach((entry) => {
            const url = entry.name;
            if (url.includes('googleusercontent.com') && !seenUrls.has(url)) {
                // Filter out thumbnails (look for larger images)
                if (!url.includes('=s64') && !url.includes('=s128') && !url.includes('=w64')) {
                    seenUrls.add(url);
                    const isVideo = /\.(mp4|webm|mov)/i.test(url);
                    items.push({
                        id: items.length + 1,
                        type: isVideo ? 'video' : 'photo',
                        src: url
                    });
                }
            }
        });
    } catch (e) {
        console.warn('Could not access performance entries:', e);
    }
    
    console.log(`\n✅ Extracted ${items.length} items:\n`);
    console.log(JSON.stringify(items, null, 2));
    
    // Also try to copy to clipboard if possible
    const json = JSON.stringify({ items: items }, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(() => {
            console.log('\n📋 Copied to clipboard! Paste into photos-data.json');
        });
    }
    
    return items;
}

// Auto-scroll function to load all images
function scrollToLoadAll(callback) {
    let lastHeight = document.body.scrollHeight;
    let scrollAttempts = 0;
    const maxAttempts = 50;
    
    const scrollInterval = setInterval(() => {
        window.scrollTo(0, document.body.scrollHeight);
        scrollAttempts++;
        
        setTimeout(() => {
            const newHeight = document.body.scrollHeight;
            if (newHeight === lastHeight || scrollAttempts >= maxAttempts) {
                clearInterval(scrollInterval);
                console.log('Finished scrolling. Now run: extractUrls()');
                if (callback) callback();
            } else {
                lastHeight = newHeight;
            }
        }, 1000);
    }, 500);
}

console.log('📸 Google Photos URL Extractor loaded!');
console.log('\nCommands:');
console.log('  scrollToLoadAll() - Scrolls the page to load all images, then extracts');
console.log('  extractUrls()     - Extracts URLs from currently loaded images\n');
console.log('💡 Tip: Run scrollToLoadAll() first, then extractUrls() after it finishes');

// Export for use
window.extractUrls = extractUrls;
window.scrollToLoadAll = scrollToLoadAll;

