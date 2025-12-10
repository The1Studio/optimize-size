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

    document.getElementById('fileList').innerHTML = f.slice(0, 100).map(x => `
        <div class="file-item">
            <div class="file-icon ${x.type}">${icons[x.type] || icons.other}</div>
            <div class="file-info">
                <div class="file-name">${x.name}</div>
                <div class="file-path">${x.path}</div>
            </div>
            <div class="file-size ${sizeClass(x.size)}">${fmt(x.size)}</div>
        </div>
    `).join('');
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
        e.target.textContent = showLargeOnly ? 'Tat ca' : '> 100KB';
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
    load();
});
