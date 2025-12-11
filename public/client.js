/**
 * File Size Analyzer - Client Side JavaScript
 */

let DATA = null;
let showLargeOnly = false;

const icons = {
    image: '🖼️',
    script: '📜',
    audio: '🎵',
    model: '🎮',
    prefab: '📦',
    folder: '📁',
    other: '📄'
};

/**
 * Toggle collapse state of a panel
 * @param {string} panelId - ID of the panel to toggle
 */
window.toggleCollapse = function(panelId) {
    const content = document.getElementById(panelId + 'Content');
    const icon = document.getElementById(panelId + 'Icon');

    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        icon.classList.remove('collapsed');
    } else {
        content.classList.add('collapsed');
        icon.classList.add('collapsed');
    }
};

/**
 * Format bytes to human readable string
 * @param {number} b - bytes
 * @returns {string}
 */
function fmt(b) {
    if (b === 0) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return (b / Math.pow(k, i)).toFixed(2) + ' ' + s[i];
}

/**
 * Get size class for styling
 * @param {number} b - bytes
 * @returns {string}
 */
function sizeClass(b) {
    if (b > 1024 * 1024) return 'size-critical';
    if (b > 500 * 1024) return 'size-warning';
    if (b > 100 * 1024) return 'size-normal';
    return 'size-small';
}

/**
 * Load data from server
 */
async function load() {
    const res = await fetch('/api/scan');
    DATA = await res.json();
    render();
}

/**
 * Main render function
 */
function render() {
    const { files, folderTree, typeStats, rootPath } = DATA;

    document.getElementById('pathInfo').textContent = rootPath;

    const total = files.reduce((s, f) => s + f.size, 0);
    document.getElementById('totalSize').textContent = fmt(total);
    document.getElementById('totalFiles').textContent = files.length;
    document.getElementById('totalFolders').textContent = Object.keys(folderTree.children || {}).length;

    const largest = files.reduce((m, f) => f.size > m.size ? f : m, { size: 0 });
    document.getElementById('largestFile').textContent = fmt(largest.size);

    renderFiles();
    renderChart();
    renderTree();
    renderRecs();
}

/**
 * Render file list
 */
function renderFiles() {
    const { files } = DATA;
    const search = document.getElementById('searchBox').value.toLowerCase();
    const sort = document.getElementById('sortBy').value;
    const type = document.getElementById('filterType').value;

    let f = files.filter(x => {
        if (x.type === 'meta') return false;
        if (search && !x.path.toLowerCase().includes(search)) return false;
        if (type !== 'all' && x.type !== type) return false;
        if (showLargeOnly && x.size < 100 * 1024) return false;
        return true;
    });

    f.sort((a, b) => {
        if (sort === 'size-desc') return b.size - a.size;
        if (sort === 'size-asc') return a.size - b.size;
        return a.name.localeCompare(b.name);
    });

    document.getElementById('fileList').innerHTML = f.slice(0, 100).map((x, idx) => `
        <div class="file-item" data-file-path="${x.path}" data-file-type="${x.type}" data-file-idx="${idx}">
            <div class="file-icon ${x.type}">${icons[x.type] || icons.other}</div>
            <div class="file-info">
                <div class="file-name">${x.name}</div>
                <div class="file-path">${x.path}</div>
            </div>
            <div class="file-size ${sizeClass(x.size)}">${fmt(x.size)}</div>
            <div class="file-dropdown" style="display: none;">
                ${x.type === 'image' ? `
                    <div class="dropdown-item" data-action="resize">📐 Resize</div>
                    <div class="dropdown-item" data-action="compress">⚡ Compress</div>
                ` : `
                    <div class="dropdown-item disabled" data-action="compress">⚡ Compress</div>
                `}
            </div>
        </div>
    `).join('');

    // Add click handlers for file items
    document.querySelectorAll('.file-item').forEach(item => {
        item.onclick = () => {
            // Close all other dropdowns
            document.querySelectorAll('.file-dropdown').forEach(d => {
                if (d !== item.querySelector('.file-dropdown')) {
                    d.style.display = 'none';
                }
            });

            // Toggle current dropdown
            const dropdown = item.querySelector('.file-dropdown');
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        };
    });

    // Add click handlers for dropdown items
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();

            if (item.classList.contains('disabled')) return;

            const action = item.getAttribute('data-action');
            const fileItem = item.closest('.file-item');
            const filePath = fileItem.getAttribute('data-file-path');
            const fileType = fileItem.getAttribute('data-file-type');

            // Hide dropdown
            fileItem.querySelector('.file-dropdown').style.display = 'none';

            if (action === 'compress' && fileType === 'image') {
                compressSingleImage(filePath);
            } else if (action === 'resize' && fileType === 'image') {
                resizeImage(filePath);
            }
        };
    });
}

/**
 * Render type distribution chart
 */
function renderChart() {
    const { typeStats } = DATA;
    const total = Object.values(typeStats).reduce((s, t) => s + t.size, 0);
    const types = Object.entries(typeStats)
        .filter(([t]) => t !== 'meta')
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 6);

    document.getElementById('typeChart').innerHTML = types.map(([t, s]) => {
        const pct = (s.size / total * 100).toFixed(1);
        return `<div class="chart-item">
            <div class="chart-header">
                <span class="chart-label">${t}</span>
                <span class="chart-count">${s.count} files</span>
            </div>
            <div class="chart-bar-wrapper">
                <div class="chart-bar">
                    <div class="chart-bar-fill type-${t}" style="width: 0%" data-width="${pct}%"></div>
                </div>
                <div class="chart-info">
                    <span class="chart-size">${fmt(s.size)}</span>
                    <span class="chart-percent">${pct}%</span>
                </div>
            </div>
        </div>`;
    }).join('');

    // Animate bars
    setTimeout(() => {
        document.querySelectorAll('.chart-bar-fill').forEach(bar => {
            bar.style.width = bar.getAttribute('data-width');
        });
    }, 100);
}

/**
 * Render folder tree
 */
function renderTree() {
    const { folderTree } = DATA;

    function node(n, d = 0) {
        const ch = Object.values(n.children || {}).sort((a, b) => b.size - a.size);
        if (!ch.length) return '';
        return ch.map(c => {
            const has = Object.keys(c.children || {}).length > 0;
            const id = 'n' + Math.random().toString(36).slice(2, 9);
            return `<div class="tree-node">
                <div class="tree-node-header" onclick="toggle('${id}')">
                    <div class="tree-toggle" id="t${id}">${has ? '▶' : ''}</div>
                    <div class="file-icon folder">📁</div>
                    <div class="tree-node-name">${c.name} <small style="color:#555">(${c.fileCount})</small></div>
                    <div class="tree-node-size ${sizeClass(c.size)}">${fmt(c.size)}</div>
                </div>
                <div class="tree-children" id="${id}">${node(c, d + 1)}</div>
            </div>`;
        }).join('');
    }
    document.getElementById('treeView').innerHTML = node(folderTree);
}

/**
 * Toggle tree node
 * @param {string} id - node id
 */
window.toggle = (id) => {
    document.getElementById(id).classList.toggle('expanded');
    document.getElementById('t' + id).classList.toggle('expanded');
};

/**
 * Render recommendations
 */
function renderRecs() {
    const { files } = DATA;
    const recs = [];

    const bigImg = files.filter(f => f.type === 'image' && f.size > 500 * 1024);
    if (bigImg.length) {
        recs.push({
            icon: '🖼️',
            title: `${bigImg.length} anh > 500KB`,
            desc: bigImg.slice(0, 3).map(f => f.name).join(', ')
        });
    }

    const bigAudio = files.filter(f => f.type === 'audio' && f.size > 1024 * 1024);
    if (bigAudio.length) {
        recs.push({
            icon: '🎵',
            title: `${bigAudio.length} audio > 1MB`,
            desc: bigAudio.slice(0, 3).map(f => f.name).join(', ')
        });
    }

    const bigModel = files.filter(f => f.type === 'model' && f.size > 2 * 1024 * 1024);
    if (bigModel.length) {
        recs.push({
            icon: '🎮',
            title: `${bigModel.length} model > 2MB`,
            desc: bigModel.slice(0, 3).map(f => f.name).join(', ')
        });
    }

    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > 50 * 1024 * 1024) {
        recs.push({
            icon: '⚠️',
            title: 'Tong > 50MB',
            desc: 'Playable ads can < 5MB'
        });
    }

    document.getElementById('recList').innerHTML = recs.length ? recs.map(r => `
        <div class="rec-item">
            <div class="rec-icon">${r.icon}</div>
            <div class="rec-content"><h4>${r.title}</h4><p>${r.desc}</p></div>
        </div>
    `).join('') : '<p style="color:#666;text-align:center">Khong co de xuat</p>';
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
    document.getElementById('searchBox').oninput = renderFiles;
    document.getElementById('sortBy').onchange = renderFiles;
    document.getElementById('filterType').onchange = renderFiles;
    document.getElementById('showLarge').onclick = (e) => {
        showLargeOnly = !showLargeOnly;
        e.target.classList.toggle('active', showLargeOnly);
        e.target.textContent = showLargeOnly ? 'All' : '> 100KB';
        renderFiles();
    };
}

/**
 * Initialize theme toggle
 */
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('theme') || 'light';

    // Apply saved theme
    document.body.className = `theme-${savedTheme}`;

    // Toggle theme
    themeToggle.onclick = () => {
        const currentTheme = document.body.classList.contains('theme-light') ? 'light' : 'dark';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        document.body.className = `theme-${newTheme}`;
        localStorage.setItem('theme', newTheme);
    };
}

/**
 * Load compression estimate
 */
async function loadCompressEstimate() {
    try {
        const res = await fetch('/api/compress/estimate');
        const data = await res.json();

        document.getElementById('totalImages').textContent = data.totalImages;
        document.getElementById('potentialSaving').textContent = `~${fmt(data.estimatedSaving)}`;
    } catch (error) {
        console.error('Failed to load estimate:', error);
    }
}

/**
 * Show result modal
 */
function showResultModal(data) {
    const modal = document.getElementById('resultModal');
    const percentValue = document.getElementById('percentValue');
    const circleProgress = document.getElementById('circleProgress');
    const resultTitle = document.getElementById('resultTitle');
    const resultSubtitle = document.getElementById('resultSubtitle');
    const resultDetails = document.getElementById('resultDetails');

    // Calculate percentage
    const percent = data.type === 'resize'
        ? ((data.saved / data.originalSize) * 100).toFixed(1)
        : ((data.saved / data.originalSize) * 100).toFixed(1);

    // Set percentage text
    percentValue.textContent = `${percent}%`;

    // Animate circle
    const circumference = 339.292;
    const offset = circumference - (percent / 100) * circumference;
    setTimeout(() => {
        circleProgress.style.strokeDashoffset = offset;
    }, 100);

    // Set title based on type
    if (data.type === 'compress') {
        resultTitle.textContent = 'Image Compressed Successfully!';
        resultSubtitle.textContent = `${fmt(data.originalSize)} → ${fmt(data.newSize)}`;
        resultDetails.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Original Size</span>
                <span class="detail-value">${fmt(data.originalSize)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Compressed Size</span>
                <span class="detail-value">${fmt(data.newSize)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Space Saved</span>
                <span class="detail-value highlight">${fmt(data.saved)} (${percent}%)</span>
            </div>
        `;
    } else if (data.type === 'resize') {
        resultTitle.textContent = 'Image Resized Successfully!';
        resultSubtitle.textContent = `${data.originalWidth}x${data.originalHeight} → ${data.newWidth}x${data.newHeight}`;
        resultDetails.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Original</span>
                <span class="detail-value">${data.originalWidth}x${data.originalHeight} (${fmt(data.originalSize)})</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Resized</span>
                <span class="detail-value">${data.newWidth}x${data.newHeight} (${fmt(data.newSize)})</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Space Saved</span>
                <span class="detail-value highlight">${fmt(data.saved)} (${percent}%)</span>
            </div>
        `;
    }

    // Show modal
    modal.style.display = 'flex';
}

/**
 * Show batch compression result modal
 */
function showBatchResultModal(data) {
    const modal = document.getElementById('resultModal');
    const percentValue = document.getElementById('percentValue');
    const circleProgress = document.getElementById('circleProgress');
    const resultTitle = document.getElementById('resultTitle');
    const resultSubtitle = document.getElementById('resultSubtitle');
    const resultDetails = document.getElementById('resultDetails');

    // Set percentage text
    percentValue.textContent = `${data.percent}%`;

    // Animate circle
    const circumference = 339.292;
    const offset = circumference - (data.percent / 100) * circumference;
    setTimeout(() => {
        circleProgress.style.strokeDashoffset = offset;
    }, 100);

    // Set title and details
    resultTitle.textContent = 'Batch Optimization Complete!';
    resultSubtitle.textContent = `Optimized ${data.compressed} out of ${data.total} images`;
    resultDetails.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Total Images</span>
            <span class="detail-value">${data.total}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">✅ Compressed</span>
            <span class="detail-value highlight">${data.compressed}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">⏭️ Skipped</span>
            <span class="detail-value">${data.skipped}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">❌ Failed</span>
            <span class="detail-value">${data.failed}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Original Size</span>
            <span class="detail-value">${fmt(data.originalSize)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">New Size</span>
            <span class="detail-value">${fmt(data.newSize)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Space Saved</span>
            <span class="detail-value highlight">${fmt(data.savedSize)} (${data.percent}%)</span>
        </div>
    `;

    // Show modal
    modal.style.display = 'flex';
}

/**
 * Close modal
 */
window.closeModal = function() {
    const modal = document.getElementById('resultModal');
    modal.style.display = 'none';

    // Reset circle
    const circleProgress = document.getElementById('circleProgress');
    circleProgress.style.strokeDashoffset = 339.292;

    // Reload data
    load();
};

/**
 * Close resize modal
 */
window.closeResizeModal = function() {
    const modal = document.getElementById('resizeModal');
    modal.style.display = 'none';
};

/**
 * Store current resize file path and metadata
 */
let currentResizeFilePath = null;
let currentImageMetadata = null;

/**
 * Resize a single image
 */
async function resizeImage(filePath) {
    const modal = document.getElementById('resizeModal');
    const fileNameEl = document.getElementById('resizeFileName');
    const originalDimensionsEl = document.getElementById('originalDimensions');
    const widthInput = document.getElementById('resizeWidth');
    const heightInput = document.getElementById('resizeHeight');

    // Store file path for later use
    currentResizeFilePath = filePath;

    // Get image metadata first
    try {
        const response = await fetch('/api/image/metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath })
        });

        const metadata = await response.json();

        if (metadata.success) {
            currentImageMetadata = metadata;

            // Update modal content
            fileNameEl.textContent = filePath;
            originalDimensionsEl.textContent = `${metadata.width} x ${metadata.height}`;
            widthInput.value = metadata.width;
            heightInput.value = metadata.height;

            // Show modal
            modal.style.display = 'flex';
        } else {
            alert('❌ Failed to get image metadata: ' + metadata.error);
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}

/**
 * Confirm and execute resize
 */
window.confirmResize = async function() {
    const widthInput = document.getElementById('resizeWidth');
    const heightInput = document.getElementById('resizeHeight');
    const width = widthInput.value;
    const height = heightInput.value;

    // At least one dimension must be provided
    if ((!width || width === '') && (!height || height === '')) {
        alert('❌ Please enter at least width or height');
        return;
    }

    // Validate provided values
    let newWidth = width ? parseInt(width) : null;
    let newHeight = height ? parseInt(height) : null;

    if (newWidth !== null && (isNaN(newWidth) || newWidth <= 0 || newWidth > 4096)) {
        alert('❌ Width must be between 1 and 4096 pixels');
        return;
    }

    if (newHeight !== null && (isNaN(newHeight) || newHeight <= 0 || newHeight > 4096)) {
        alert('❌ Height must be between 1 and 4096 pixels');
        return;
    }

    // Close resize modal
    closeResizeModal();

    try {
        const response = await fetch('/api/resize/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filePath: currentResizeFilePath,
                width: newWidth,
                height: newHeight
            })
        });

        const result = await response.json();

        if (result.success) {
            if (result.skipped) {
                alert(`ℹ️ No resize needed\n\n${result.reason}`);
            } else {
                showResultModal({ ...result, type: 'resize' });
            }
        } else {
            alert(`❌ Resize failed: ${result.error}`);
        }
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
};

/**
 * Compress a single image file
 */
async function compressSingleImage(filePath) {
    if (!confirm(`Compress this image?\n\n${filePath}\n\nThis will overwrite the original file.`)) {
        return;
    }

    try {
        const response = await fetch('/api/compress/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath, quality: 80 })
        });

        const result = await response.json();

        if (result.success) {
            if (result.skipped) {
                alert(`ℹ️ No compression needed\n\n${result.reason}`);
            } else {
                showResultModal({ ...result, type: 'compress' });
            }
        } else {
            alert(`❌ Compression failed: ${result.error}`);
        }
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

/**
 * Handle image compression
 */
async function compressImages() {
    const btn = document.getElementById('btnCompressImages');
    const progressWrapper = document.getElementById('compressProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const optimizePath = document.getElementById('optimizePath').value.trim();

    // Disable button
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span><span>Processing...</span>';

    // Show progress
    progressWrapper.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    try {
        const response = await fetch('/api/compress/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quality: 80,
                targetPath: optimizePath || null
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));

                    if (data.type === 'progress') {
                        // Update progress (estimate based on current file)
                        const percent = Math.min(95, (data.current / 100) * 100);
                        progressFill.style.width = `${percent}%`;
                        progressText.textContent = `${Math.floor(percent)}% - ${data.file}`;
                    } else if (data.type === 'complete') {
                        // Show complete
                        progressFill.style.width = '100%';
                        progressText.textContent = '100% - Complete!';

                        const { results } = data;
                        setTimeout(() => {
                            // Show result modal instead of alert
                            const percent = results.originalSize > 0
                                ? ((results.savedSize / results.originalSize) * 100).toFixed(1)
                                : 0;

                            showBatchResultModal({
                                total: results.total,
                                compressed: results.compressed,
                                skipped: results.skipped,
                                failed: results.failed,
                                originalSize: results.originalSize,
                                newSize: results.newSize,
                                savedSize: results.savedSize,
                                percent: percent
                            });
                        }, 500);
                    } else if (data.type === 'error') {
                        alert('❌ Error: ' + data.error);
                    }
                }
            }
        }
    } catch (error) {
        alert('❌ Error compressing images: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">⚡</span><span>Optimize All Images</span>';
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.file-item')) {
        document.querySelectorAll('.file-dropdown').forEach(d => {
            d.style.display = 'none';
        });
    }
});

/**
 * Change root path for scanning - Using native Windows dialog
 */
window.changeRootPath = async function() {
    try {
        const currentRoot = document.getElementById('pathInfo').textContent.replace('Scanning: ', '');

        const response = await fetch('/api/native-folder-dialog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initialPath: currentRoot })
        });

        const result = await response.json();

        if (result.success && result.path) {
            const setRootResponse = await fetch('/api/set-root', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rootPath: result.path })
            });

            const setRootData = await setRootResponse.json();

            if (setRootData.success) {
                location.reload();
            } else {
                alert(`❌ Error: ${setRootData.error}`);
            }
        }
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
};

/**
 * Browse for optimize path - Using native Windows dialog
 */
window.browseOptimizePath = async function() {
    try {
        const currentRoot = document.getElementById('pathInfo').textContent.replace('Scanning: ', '');

        const response = await fetch('/api/native-folder-dialog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initialPath: currentRoot })
        });

        const result = await response.json();

        if (result.success && result.path) {
            // Calculate relative path from root
            let relativePath = '';
            if (result.path.startsWith(currentRoot)) {
                relativePath = result.path.substring(currentRoot.length).replace(/^[\\/]/, '');
            } else {
                relativePath = result.path;
            }

            document.getElementById('optimizePath').value = relativePath;
        }
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
};

// Folder Browser State
let folderBrowserState = {
    currentPath: null,
    mode: null, // 'optimize' or 'root'
    directories: []
};

/**
 * Open folder browser modal
 */
async function openFolderBrowser(mode) {
    folderBrowserState.mode = mode;

    const modal = document.getElementById('folderBrowserModal');
    modal.style.display = 'flex';

    // Start from current root
    const currentRoot = document.getElementById('pathInfo').textContent.replace('Scanning: ', '');
    await loadDirectories(currentRoot);
}

/**
 * Close folder browser
 */
window.closeFolderBrowser = function() {
    const modal = document.getElementById('folderBrowserModal');
    modal.style.display = 'none';
};

/**
 * Load directories for current path
 */
async function loadDirectories(dirPath) {
    const folderList = document.getElementById('folderList');
    const currentPathEl = document.getElementById('browserCurrentPath');

    // Show loading
    folderList.innerHTML = '<div class="loading">Loading folders...</div>';

    try {
        const response = await fetch('/api/list-directories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dirPath })
        });

        const data = await response.json();

        if (data.success) {
            folderBrowserState.currentPath = data.currentPath;
            folderBrowserState.directories = data.directories;

            // Update current path display
            currentPathEl.textContent = data.currentPath;

            // Render folder list
            if (data.directories.length === 0) {
                folderList.innerHTML = `
                    <div class="empty-folder">
                        <div class="empty-folder-icon">📂</div>
                        <div>No subfolders found</div>
                    </div>
                `;
            } else {
                folderList.innerHTML = data.directories.map(dir => `
                    <div class="folder-item" onclick="navigateToFolder('${dir.path.replace(/\\/g, '\\\\')}')">
                        <div class="folder-icon">📁</div>
                        <div class="folder-name">${dir.name}</div>
                    </div>
                `).join('');
            }
        } else {
            folderList.innerHTML = `<div class="loading">❌ Error: ${data.error}</div>`;
        }
    } catch (error) {
        folderList.innerHTML = `<div class="loading">❌ Error loading folders</div>`;
    }
}

/**
 * Navigate to a folder
 */
window.navigateToFolder = async function(folderPath) {
    await loadDirectories(folderPath);
};

/**
 * Navigate up one level
 */
window.navigateUp = async function() {
    const currentPathEl = document.getElementById('browserCurrentPath');
    const currentPath = currentPathEl.textContent;

    // Get parent directory by removing last segment
    const parentPath = currentPath.split(/[\\/]/).slice(0, -1).join('\\');

    if (parentPath) {
        await loadDirectories(parentPath);
    }
};

/**
 * Select current folder
 */
window.selectCurrentFolder = function() {
    const currentPath = folderBrowserState.currentPath;
    const currentRoot = document.getElementById('pathInfo').textContent.replace('Scanning: ', '');

    if (folderBrowserState.mode === 'optimize') {
        // Calculate relative path from root
        let relativePath = '';
        if (currentPath.startsWith(currentRoot)) {
            relativePath = currentPath.substring(currentRoot.length).replace(/^[\\/]/, '');
        } else {
            relativePath = currentPath;
        }

        document.getElementById('optimizePath').value = relativePath;
        window.closeFolderBrowser();
    } else if (folderBrowserState.mode === 'root') {
        // Change root directory
        fetch('/api/set-root', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rootPath: currentPath })
        })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                window.closeFolderBrowser();
                location.reload();
            } else {
                alert(`❌ Error: ${result.error}`);
            }
        })
        .catch(error => {
            alert(`❌ Error: ${error.message}`);
        });
    }
};

// Auto-reload feature - check for file changes
let lastKnownModified = Date.now();
function startAutoReload() {
    setInterval(async () => {
        try {
            const res = await fetch('/api/reload-check');
            const data = await res.json();

            if (data.lastModified > lastKnownModified) {
                console.log('Files changed, reloading...');
                location.reload();
            }
        } catch (err) {
            // Server might be restarting, ignore
        }
    }, 1000); // Check every second
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
    load();
    loadCompressEstimate();
    startAutoReload(); // Start auto-reload

    // Bind compress button
    document.getElementById('btnCompressImages').onclick = compressImages;
});
