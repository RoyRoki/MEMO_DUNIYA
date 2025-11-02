// MEGHTOSH Data Generator
// Loads images and videos from Google Photos albums or random topic photos

const GRID_COLUMNS = 50;
const ITEM_SIZE = 200;

// Google Photos album links
const ALBUM_LINKS = [
    'https://photos.app.goo.gl/fzWXAYTjxVAJYk7o6',
    'https://photos.app.goo.gl/gFbq1VA5iEVqJmEz5'
];

// Photo topics for random selection
const PHOTO_TOPICS = [
    'nature', 'mountains', 'ocean', 'forest', 'sunset', 'sunrise',
    'travel', 'adventure', 'beach', 'waterfall', 'landscape', 'wildlife',
    'city', 'urban', 'architecture', 'sky', 'clouds', 'meghalaya',
    'trip', 'friends', 'memories', 'vacation', 'explore', 'journey'
];

/**
 * Get a random topic for this session
 */
function getRandomTopic() {
    const topic = PHOTO_TOPICS[Math.floor(Math.random() * PHOTO_TOPICS.length)];
    console.log(`🎲 Random topic selected: "${topic}"`);
    return topic;
}

// Global counter for unique item IDs (for infinite scroll)
let globalItemIdCounter = 0;

/**
 * Generate array of random topic-based images and videos
 * @param {number} totalItems - Total number of items to generate (default: 2000)
 * @param {string} topic - Photo topic/keyword (optional, random if not provided)
 * @param {number} startId - Starting ID for items (for infinite scroll)
 * @param {number} startIndex - Starting index in the grid (for appending items)
 * @returns {Array} Array of item objects with id, type, src, x, y, column, row
 */
function generateItemData(totalItems = 2000, topic = null, startId = null, startIndex = 0) {
    const items = [];
    
    // Select a random topic - new topic on each refresh
    const selectedTopic = topic || getRandomTopic();
    
    // Use global counter or provided startId
    const baseId = startId !== null ? startId : (globalItemIdCounter + 1);
    
    for (let i = 0; i < totalItems; i++) {
        const globalIndex = startIndex + i;
        const row = Math.floor(globalIndex / GRID_COLUMNS);
        const column = globalIndex % GRID_COLUMNS;
        
        // Mix of photos and videos (mostly photos - 10% videos)
        const isVideo = Math.random() > 0.9;
        const type = isVideo ? 'video' : 'photo';
        
        // Use Picsum Photos with topic-based seeds for variety
        // Each topic gets a different seed range, and each image gets a unique ID
        // This ensures different images for each topic while maintaining variety
        const topicSeed = selectedTopic.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const imageId = (topicSeed * 10000 + globalIndex) % 10000; // Unique ID per topic+position
        const imageUrl = `https://picsum.photos/seed/${selectedTopic}-${imageId}/200`;
        
        // For videos, we'll use placeholder video URLs (Picsum doesn't have videos)
        // In production, these would be real video URLs
        const mediaUrl = isVideo 
            ? `https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4` 
            : imageUrl;
        
        items.push({
            id: baseId + i,
            type: type,
            src: mediaUrl,
            x: column * ITEM_SIZE,
            y: row * ITEM_SIZE,
            column: column,
            row: row,
            topic: selectedTopic
        });
    }
    
    // Update global counter
    globalItemIdCounter = baseId + totalItems - 1;
    
    return items;
}

/**
 * Load items from JSON file if available, otherwise return null to use random topic
 * 
 * Note: Direct fetching from Google Photos links is not possible due to CORS restrictions.
 * Use the browser script (extract-urls-browser.js) to extract URLs and save them to photos-data.json
 */
async function loadItemData() {
    try {
        // Try to load from photos-data.json
        const response = await fetch('photos-data.json');
        if (response.ok) {
            const data = await response.json();
            if (data.items && data.items.length > 0) {
                // Check if items have real URLs (not placeholder/topic-based)
                const hasRealUrls = data.items.some(item => 
                    item.src && 
                    !item.src.includes('picsum.photos') && 
                    !item.src.includes('unsplash') &&
                    !item.src.includes('placeholder')
                );
                
                if (hasRealUrls) {
                    console.log(`📸 Loading ${data.items.length} real photos/videos from photos-data.json`);
                    
                    // Process items from JSON and assign grid positions
                    const items = [];
                    const totalRows = Math.ceil(data.items.length / GRID_COLUMNS);
                    
                    data.items.forEach((item, index) => {
                        const row = Math.floor(index / GRID_COLUMNS);
                        const column = index % GRID_COLUMNS;
                        
                        items.push({
                            id: item.id || index + 1,
                            type: item.type || (item.src.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'photo'),
                            src: item.src,
                            x: column * ITEM_SIZE,
                            y: row * ITEM_SIZE,
                            column: column,
                            row: row
                        });
                    });
                    
                    return items;
                } else {
                    console.info('📋 photos-data.json found but contains placeholder URLs.');
                }
            } else {
                console.info('📋 photos-data.json found but items array is empty.');
            }
        }
    } catch (error) {
        // File doesn't exist - this is normal, will use random topic images
    }
    
    // Return null to indicate we should use random topic images
    return null;
}

// Initialize with random topic - select topic once at startup
const selectedTopic = getRandomTopic();
let ITEM_DATA = generateItemData(2000, selectedTopic, 1, 0);
let usingRealData = false;

/**
 * Add more items to the existing ITEM_DATA array
 * @param {number} count - Number of items to add (default: 2000)
 * @param {string} direction - Direction to add: 'right', 'left', 'top', 'bottom'
 */
function addMoreItems(count = 2000, direction = 'right') {
    if (usingRealData) {
        console.log('📸 Using real photos - infinite scroll disabled');
        return;
    }
    
    const currentLength = ITEM_DATA.length;
    const currentRows = Math.ceil(currentLength / GRID_COLUMNS);
    let startIndex = 0;
    let newItems = [];
    
    if (direction === 'right' || direction === 'bottom') {
        // Add to the end (right/bottom)
        startIndex = currentLength;
        newItems = generateItemData(count, selectedTopic, globalItemIdCounter + 1, startIndex);
        ITEM_DATA = [...ITEM_DATA, ...newItems];
    } else if (direction === 'left') {
        // Add to the left - find leftmost column and add items before it
        const minX = Math.min(...ITEM_DATA.map(item => item.x));
        const itemsToAdd = count;
        const newCols = Math.ceil(itemsToAdd / currentRows);
        
        // Generate items
        newItems = generateItemData(count, selectedTopic, globalItemIdCounter + 1, -itemsToAdd);
        
        // Position new items to the left
        newItems.forEach((item, idx) => {
            const col = idx % newCols;
            const row = Math.floor(idx / newCols);
            item.x = minX - ((newCols - col) * ITEM_SIZE);
            item.y = (Math.floor(Math.min(...ITEM_DATA.map(i => i.y)) / ITEM_SIZE) + row) * ITEM_SIZE;
            item.column = Math.floor(item.x / ITEM_SIZE);
            item.row = Math.floor(item.y / ITEM_SIZE);
        });
        
        ITEM_DATA = [...newItems, ...ITEM_DATA];
    } else if (direction === 'top') {
        // Add to the top - find topmost row and add items above it
        const minY = Math.min(...ITEM_DATA.map(item => item.y));
        const itemsToAdd = count;
        const newRows = Math.ceil(itemsToAdd / GRID_COLUMNS);
        
        // Generate items
        newItems = generateItemData(count, selectedTopic, globalItemIdCounter + 1, -itemsToAdd);
        
        // Position new items above existing ones
        newItems.forEach((item, idx) => {
            const col = idx % GRID_COLUMNS;
            const row = Math.floor(idx / GRID_COLUMNS);
            item.x = col * ITEM_SIZE;
            item.y = minY - ((newRows - row) * ITEM_SIZE);
            item.column = col;
            item.row = Math.floor(item.y / ITEM_SIZE);
        });
        
        ITEM_DATA = [...newItems, ...ITEM_DATA];
    }
    
    console.log(`➕ Added ${count} items to ${direction} (Total: ${ITEM_DATA.length} items)`);
    return newItems;
}

// Make addMoreItems available globally
window.addMoreItemsToMEGHTOSH = addMoreItems;

// Attempt to load real data asynchronously
loadItemData().then(data => {
    if (data && data.length > 0) {
        // Real data loaded from photos-data.json
        ITEM_DATA = data;
        usingRealData = true;
        
        // Re-initialize the app with new data
        if (typeof window.reinitializeMEGHTOSH === 'function') {
            window.reinitializeMEGHTOSH();
        }
    } else {
        // No real data found, using random topic images
        const topic = ITEM_DATA[0]?.topic || selectedTopic;
        console.log(`🎲 Using ${ITEM_DATA.length} random "${topic}" images`);
        console.info('💡 Add your photos by extracting URLs and saving to photos-data.json');
    }
}).catch(error => {
    console.error('Error loading item data:', error);
    // On error, we already have topic images loaded, just log the topic
    const topic = ITEM_DATA[0]?.topic || selectedTopic;
    console.log(`🎲 Using ${ITEM_DATA.length} random "${topic}" images`);
});

