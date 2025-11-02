// MEGHTOSH Virtualized Grid Viewer
// Core virtualization engine with pan, zoom, and render logic
// Note: GRID_COLUMNS and ITEM_SIZE are defined in data.js

// Constants
const BUFFER_SIZE = 3; // 3 row/column margin for smooth scrolling (prevents pop-in)
const MAX_DOM_NODES = 500; // Maximum number of DOM nodes to keep in memory

// DOM Elements
const viewport = document.getElementById('viewport');
const virtualCanvas = document.getElementById('virtual-canvas');

// State
let state = {
    panX: 0,
    panY: 0,
    zoom: 1.0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartPanX: 0,
    dragStartPanY: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    canvasWidth: 0,
    canvasHeight: 0
};

// DOM Tracking
const renderedItems = new Map(); // Map<itemId, HTMLElement>
let renderAnimationFrame = null;

// Infinite Scroll Tracking
const LOAD_THRESHOLD = 2000; // Load more items when within 2000px of boundary
let isLoadingMore = false;

// ============================================================================
// Phase 2: Canvas Sizing & Initialization
// ============================================================================

function calculateCanvasDimensions() {
    if (!ITEM_DATA || ITEM_DATA.length === 0) {
        return { width: 0, height: 0 };
    }
    
    const totalRows = Math.ceil(ITEM_DATA.length / GRID_COLUMNS);
    return {
        width: GRID_COLUMNS * ITEM_SIZE,
        height: totalRows * ITEM_SIZE
    };
}

function initializeCanvas() {
    const dimensions = calculateCanvasDimensions();
    state.canvasWidth = dimensions.width;
    state.canvasHeight = dimensions.height;
    
    virtualCanvas.style.width = `${state.canvasWidth}px`;
    virtualCanvas.style.height = `${state.canvasHeight}px`;
    
    // Update viewport dimensions
    state.viewportWidth = viewport.clientWidth;
    state.viewportHeight = viewport.clientHeight;
}

// ============================================================================
// Phase 3: Pan & Zoom System
// ============================================================================

function updateTransform() {
    virtualCanvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

function handleMouseDown(e) {
    if (e.button !== 0) return; // Only left mouse button
    
    state.isDragging = true;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.dragStartPanX = state.panX;
    state.dragStartPanY = state.panY;
    
    viewport.classList.add('dragging');
    e.preventDefault();
}

function handleMouseMove(e) {
    if (!state.isDragging) return;
    
    const deltaX = e.clientX - state.dragStartX;
    const deltaY = e.clientY - state.dragStartY;
    
    state.panX = state.dragStartPanX + deltaX;
    state.panY = state.dragStartPanY + deltaY;
    
    updateTransform();
    scheduleRender();
    // Check boundaries while dragging
    checkBoundariesAndLoad();
    
    e.preventDefault();
}

function handleMouseUp(e) {
    if (!state.isDragging) return;
    
    state.isDragging = false;
    viewport.classList.remove('dragging');
    
    scheduleRender();
    e.preventDefault();
}

function handleWheel(e) {
    e.preventDefault();
    
    const zoomSensitivity = 0.1;
    const zoomDelta = -e.deltaY * zoomSensitivity / 1000;
    const newZoom = Math.max(0.1, Math.min(5.0, state.zoom + zoomDelta));
    
    // Zoom around cursor position
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Convert mouse position to virtual canvas coordinates before zoom
    const worldX = (mouseX - state.panX) / state.zoom;
    const worldY = (mouseY - state.panY) / state.zoom;
    
    // Apply zoom
    state.zoom = newZoom;
    
    // Adjust pan to zoom around cursor
    state.panX = mouseX - worldX * state.zoom;
    state.panY = mouseY - worldY * state.zoom;
    
    updateTransform();
    scheduleRender();
    // Check boundaries after zoom
    checkBoundariesAndLoad();
}

function handleResize() {
    state.viewportWidth = viewport.clientWidth;
    state.viewportHeight = viewport.clientHeight;
    scheduleRender();
}

// ============================================================================
// Phase 4: Viewport/Camera Tracking
// ============================================================================

/**
 * Calculate visible bounds in virtual canvas coordinates
 * @returns {Object} {left, top, right, bottom}
 */
function calculateViewportBounds() {
    // Convert viewport corners to virtual canvas coordinates
    const topLeft = screenToWorld(0, 0);
    const topRight = screenToWorld(state.viewportWidth, 0);
    const bottomLeft = screenToWorld(0, state.viewportHeight);
    const bottomRight = screenToWorld(state.viewportWidth, state.viewportHeight);
    
    const left = Math.min(topLeft.x, bottomLeft.x);
    const right = Math.max(topRight.x, bottomRight.x);
    const top = Math.min(topLeft.y, topRight.y);
    const bottom = Math.max(bottomLeft.y, bottomRight.y);
    
    // Add buffer
    const buffer = BUFFER_SIZE * ITEM_SIZE;
    
    return {
        left: left - buffer,
        top: top - buffer,
        right: right + buffer,
        bottom: bottom + buffer
    };
}

/**
 * Convert screen coordinates to world (virtual canvas) coordinates
 */
function screenToWorld(screenX, screenY) {
    const worldX = (screenX - state.panX) / state.zoom;
    const worldY = (screenY - state.panY) / state.zoom;
    return { x: worldX, y: worldY };
}

/**
 * Convert grid coordinates to world coordinates
 */
function gridToWorld(column, row) {
    return {
        x: column * ITEM_SIZE,
        y: row * ITEM_SIZE
    };
}

// ============================================================================
// Phase 5: Virtualization Engine
// ============================================================================

/**
 * Check if an item intersects with the viewport bounds
 */
function itemIntersectsViewport(item, bounds) {
    const itemLeft = item.x;
    const itemRight = item.x + ITEM_SIZE;
    const itemTop = item.y;
    const itemBottom = item.y + ITEM_SIZE;
    
    return !(
        itemRight < bounds.left ||
        itemLeft > bounds.right ||
        itemBottom < bounds.top ||
        itemTop > bounds.bottom
    );
}

/**
 * Find all visible items in the viewport
 */
function findVisibleItems() {
    const bounds = calculateViewportBounds();
    const visibleItems = [];
    
    for (const item of ITEM_DATA) {
        if (itemIntersectsViewport(item, bounds)) {
            visibleItems.push(item);
        }
    }
    
    return visibleItems;
}

/**
 * Create a DOM element for a grid item
 */
function createItemElement(item) {
    const element = document.createElement('div');
    element.className = 'grid-item';
    element.dataset.itemId = item.id;
    
    if (item.type === 'video') {
        // For placeholder videos, show an image with video indicator
        // Real videos from photos-data.json will still use video elements
        const isPlaceholderVideo = item.src.includes('sample-videos.com');
        
        if (isPlaceholderVideo) {
            // Show as image with video icon overlay for placeholder videos
            const img = document.createElement('img');
            img.src = `https://picsum.photos/200?random=${item.id}-video`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            element.appendChild(img);
            
            // Add video icon overlay
            const icon = document.createElement('div');
            icon.style.position = 'absolute';
            icon.style.bottom = '8px';
            icon.style.right = '8px';
            icon.style.width = '24px';
            icon.style.height = '24px';
            icon.style.background = 'rgba(0, 0, 0, 0.7)';
            icon.style.borderRadius = '4px';
            icon.style.display = 'flex';
            icon.style.alignItems = 'center';
            icon.style.justifyContent = 'center';
            icon.style.color = 'white';
            icon.style.fontSize = '12px';
            icon.innerHTML = '▶';
            element.style.position = 'relative';
            element.appendChild(icon);
        } else {
            // Real video - use video element with optimized settings
            const video = document.createElement('video');
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.preload = 'none'; // Don't preload until needed
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');

            // Mark video element for lazy play control
            video.dataset.videoLazy = 'true';

            // Handle errors - fallback to image
            video.addEventListener('error', (e) => {
                console.warn('Video load error for', item.src, e);
                element.innerHTML = '';
                const img = document.createElement('img');
                img.src = `https://picsum.photos/200?random=${item.id}`;
                img.loading = 'lazy';
                img.decoding = 'async';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                element.appendChild(img);
            });

            // Set src but don't load yet (will be handled by visibility check)
            video.src = item.src;
            element.appendChild(video);
        }
    } else {
        const img = document.createElement('img');
        img.src = item.src;
        img.loading = 'lazy';
        img.decoding = 'async'; // Non-blocking image decode
        img.alt = `Photo ${item.id}`;
        img.onerror = function() {
            this.style.background = '#444';
            this.style.display = 'flex';
            this.style.alignItems = 'center';
            this.style.justifyContent = 'center';
            this.style.color = '#888';
        };
        element.appendChild(img);
    }
    
    return element;
}

/**
 * Update item positions in the DOM
 */
function updateItemPositions() {
    renderedItems.forEach((element, itemId) => {
        const item = ITEM_DATA.find(i => i.id === parseInt(itemId));
        if (item) {
            element.style.left = `${item.x}px`;
            element.style.top = `${item.y}px`;
        }
    });
}

/**
 * Check if item is in actual viewport (not buffer zone)
 */
function itemInActualViewport(item) {
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(state.viewportWidth, state.viewportHeight);

    const bounds = {
        left: topLeft.x,
        top: topLeft.y,
        right: bottomRight.x,
        bottom: bottomRight.y
    };

    const itemLeft = item.x;
    const itemRight = item.x + ITEM_SIZE;
    const itemTop = item.y;
    const itemBottom = item.y + ITEM_SIZE;

    return !(
        itemRight < bounds.left ||
        itemLeft > bounds.right ||
        itemBottom < bounds.top ||
        itemTop > bounds.bottom
    );
}

/**
 * Manage video playback based on visibility
 */
function manageVideoPlayback() {
    renderedItems.forEach((element, itemId) => {
        const video = element.querySelector('video[data-video-lazy]');
        if (!video) return;

        const item = ITEM_DATA.find(i => i.id === parseInt(itemId));
        if (!item) return;

        const isVisible = itemInActualViewport(item);

        if (isVisible) {
            // Video is in actual viewport - load and play
            if (video.paused && video.readyState === 0) {
                video.load();
            }
            video.play().catch(() => {
                // Autoplay blocked - that's OK
            });
        } else {
            // Video is in buffer but not visible - pause to save resources
            if (!video.paused) {
                video.pause();
            }
        }
    });
}

/**
 * Cleanup video element before removal
 */
function cleanupVideoElement(element) {
    const video = element.querySelector('video');
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load(); // Reset video element
    }
}

/**
 * DOM Manager: Sync visible items with DOM
 */
function syncDOM() {
    const visibleItems = findVisibleItems();
    const visibleItemIds = new Set(visibleItems.map(item => item.id));

    // Remove items that are no longer visible
    const itemsToRemove = [];
    renderedItems.forEach((element, itemId) => {
        if (!visibleItemIds.has(parseInt(itemId))) {
            itemsToRemove.push(itemId);
        }
    });

    itemsToRemove.forEach(itemId => {
        const element = renderedItems.get(itemId);
        if (element) {
            cleanupVideoElement(element); // Cleanup before removal
            element.remove();
            renderedItems.delete(itemId);
        }
    });

    // Memory management: if too many DOM nodes, remove furthest items
    if (renderedItems.size > MAX_DOM_NODES) {
        const bounds = calculateViewportBounds();
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;

        // Calculate distance from viewport center for all items
        const itemDistances = [];
        renderedItems.forEach((element, itemId) => {
            const item = ITEM_DATA.find(i => i.id === parseInt(itemId));
            if (item && !visibleItemIds.has(item.id)) {
                const itemCenterX = item.x + ITEM_SIZE / 2;
                const itemCenterY = item.y + ITEM_SIZE / 2;
                const distance = Math.sqrt(
                    Math.pow(itemCenterX - centerX, 2) +
                    Math.pow(itemCenterY - centerY, 2)
                );
                itemDistances.push({ itemId, distance });
            }
        });

        // Sort by distance and remove furthest items
        itemDistances.sort((a, b) => b.distance - a.distance);
        const itemsToRemoveCount = renderedItems.size - MAX_DOM_NODES;
        for (let i = 0; i < itemsToRemoveCount && i < itemDistances.length; i++) {
            const itemId = itemDistances[i].itemId;
            const element = renderedItems.get(itemId);
            if (element) {
                cleanupVideoElement(element);
                element.remove();
                renderedItems.delete(itemId);
            }
        }
    }

    // Add items that should be visible but aren't in DOM
    visibleItems.forEach(item => {
        const itemIdStr = item.id.toString();
        if (!renderedItems.has(itemIdStr)) {
            const element = createItemElement(item);
            element.style.left = `${item.x}px`;
            element.style.top = `${item.y}px`;
            virtualCanvas.appendChild(element);
            renderedItems.set(itemIdStr, element);
        }
    });

    // Update positions for all rendered items (in case zoom changed)
    updateItemPositions();

    // Manage video playback based on actual visibility
    manageVideoPlayback();
}

/**
 * Download a media file (image or video)
 */
async function downloadMedia(item) {
    try {
        console.log(`⬇️ Downloading ${item.type}:`, item.src);
        
        let blob;
        let extension = '';
        
        // Try to get file extension from URL first
        try {
            const urlPath = new URL(item.src).pathname;
            const urlMatch = urlPath.match(/\.(\w+)(?:[?#]|$)/);
            if (urlMatch) {
                extension = urlMatch[1];
            }
        } catch (e) {
            // URL parsing failed, try regex on string
            const urlMatch = item.src.match(/\.(\w+)(?:[?#]|$)/);
            if (urlMatch) {
                extension = urlMatch[1];
            }
        }
        
        // For images, try using canvas if fetch fails (handles CORS)
        if (item.type === 'photo') {
            try {
                // Try fetch first
                const response = await fetch(item.src);
                if (response.ok) {
                    blob = await response.blob();
                    const contentType = response.headers.get('content-type');
                    if (!extension && contentType) {
                        if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg';
                        else if (contentType.includes('png')) extension = 'png';
                        else if (contentType.includes('gif')) extension = 'gif';
                        else if (contentType.includes('webp')) extension = 'webp';
                    }
                }
            } catch (fetchError) {
                // Fetch failed, try canvas method (works if image is already loaded)
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                await new Promise((resolve, reject) => {
                    img.onload = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            canvas.toBlob((b) => {
                                if (b) {
                                    blob = b;
                                    if (!extension) extension = 'png';
                                    resolve();
                                } else {
                                    reject(new Error('Canvas conversion failed'));
                                }
                            }, 'image/png');
                        } catch (e) {
                            reject(e);
                        }
                    };
                    img.onerror = () => reject(new Error('Image load failed'));
                    img.src = item.src;
                });
            }
        } else {
            // For videos, use fetch
            const response = await fetch(item.src);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            blob = await response.blob();
            const contentType = response.headers.get('content-type');
            if (!extension && contentType) {
                if (contentType.includes('mp4')) extension = 'mp4';
                else if (contentType.includes('webm')) extension = 'webm';
                else if (contentType.includes('mov')) extension = 'mov';
            }
        }
        
        if (!blob) {
            throw new Error('Failed to get file blob');
        }
        
        // Create filename
        const filename = `meghosh-${item.id}.${extension || (item.type === 'video' ? 'mp4' : 'jpg')}`;
        
        // Create download link and trigger download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up blob URL
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        
        console.log(`✅ Downloaded: ${filename}`);
    } catch (error) {
        console.error('❌ Download failed:', error);
        alert(`Download failed: ${error.message}\n\nIf this is a CORS issue, try opening the image in a new tab and saving it manually.`);
    }
}

/**
 * Handle double-click on grid items
 */
function handleDoubleClick(e) {
    // Find the closest grid item
    const gridItem = e.target.closest('.grid-item');
    if (!gridItem) return;

    // Get item ID from data attribute
    const itemId = parseInt(gridItem.dataset.itemId);
    if (!itemId) return;

    // Find the item in ITEM_DATA
    const item = ITEM_DATA.find(i => i.id === itemId);
    if (!item) return;

    // Prevent default, stop propagation, and prevent dragging
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Reset dragging state if active
    if (state.isDragging) {
        state.isDragging = false;
        viewport.classList.remove('dragging');
    }

    // Download the media
    downloadMedia(item);
}

/**
 * Check boundaries and load more items if needed
 */
function checkBoundariesAndLoad() {
    if (isLoadingMore || !ITEM_DATA || ITEM_DATA.length === 0) return;
    
    const bounds = calculateViewportBounds();
    const canvasDims = calculateCanvasDimensions();
    
    // Calculate distance to each boundary
    const distanceToRight = canvasDims.width - bounds.right;
    const distanceToLeft = bounds.left - 0;
    const distanceToBottom = canvasDims.height - bounds.bottom;
    const distanceToTop = bounds.top - 0;
    
    // Check if we're near a boundary and load more items
    if (distanceToRight < LOAD_THRESHOLD) {
        // Near right boundary - load more to the right
        isLoadingMore = true;
        if (typeof window.addMoreItemsToMEGHTOSH === 'function') {
            window.addMoreItemsToMEGHTOSH(2000, 'right');
            updateCanvasSize();
            isLoadingMore = false;
            scheduleRender();
        }
    } else if (distanceToBottom < LOAD_THRESHOLD) {
        // Near bottom boundary - load more to the bottom
        isLoadingMore = true;
        if (typeof window.addMoreItemsToMEGHTOSH === 'function') {
            window.addMoreItemsToMEGHTOSH(2000, 'bottom');
            updateCanvasSize();
            isLoadingMore = false;
            scheduleRender();
        }
    } else if (distanceToLeft < LOAD_THRESHOLD && bounds.left < LOAD_THRESHOLD) {
        // Near left boundary - load more to the left
        isLoadingMore = true;
        if (typeof window.addMoreItemsToMEGHTOSH === 'function') {
            window.addMoreItemsToMEGHTOSH(2000, 'left');
            updateCanvasSize();
            isLoadingMore = false;
            scheduleRender();
        }
    } else if (distanceToTop < LOAD_THRESHOLD && bounds.top < LOAD_THRESHOLD) {
        // Near top boundary - load more to the top
        isLoadingMore = true;
        if (typeof window.addMoreItemsToMEGHTOSH === 'function') {
            window.addMoreItemsToMEGHTOSH(2000, 'top');
            updateCanvasSize();
            isLoadingMore = false;
            scheduleRender();
        }
    }
}

/**
 * Update canvas size when items are added
 */
function updateCanvasSize() {
    const dimensions = calculateCanvasDimensions();
    state.canvasWidth = dimensions.width;
    state.canvasHeight = dimensions.height;
    
    virtualCanvas.style.width = `${state.canvasWidth}px`;
    virtualCanvas.style.height = `${state.canvasHeight}px`;
}

/**
 * Main render function (throttled with requestAnimationFrame)
 */
function render() {
    syncDOM();
    checkBoundariesAndLoad(); // Check if we need to load more items
    renderAnimationFrame = null;
}

function scheduleRender() {
    if (renderAnimationFrame === null) {
        renderAnimationFrame = requestAnimationFrame(render);
    }
}

// ============================================================================
// Phase 6: Load from Center
// ============================================================================

function loadFromCenter() {
    // Calculate center of virtual canvas
    const centerX = state.canvasWidth / 2;
    const centerY = state.canvasHeight / 2;
    
    // Center the viewport on the canvas center
    state.panX = state.viewportWidth / 2 - centerX * state.zoom;
    state.panY = state.viewportHeight / 2 - centerY * state.zoom;
    
    updateTransform();
    render();
}

// ============================================================================
// Event Listeners & Initialization
// ============================================================================

// Flag to track if event listeners are already set up
let eventListenersSetup = false;

function setupEventListeners() {
    if (eventListenersSetup) return;
    
    viewport.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', handleResize);
    viewport.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Double-click to download
    viewport.addEventListener('dblclick', handleDoubleClick);
    
    eventListenersSetup = true;
}

function initialize() {
    // Initialize canvas dimensions (will use placeholder data if real data isn't loaded yet)
    initializeCanvas();
    
    // Set up event listeners (only once)
    setupEventListeners();
    
    // Load from center
    loadFromCenter();
}

// Function to re-initialize when new data is loaded
function reinitializeWithNewData() {
    initializeCanvas();
    loadFromCenter();
}

// Make this function globally accessible so data.js can call it
window.reinitializeMEGHTOSH = reinitializeWithNewData;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

