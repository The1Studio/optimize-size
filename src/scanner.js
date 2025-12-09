/**
 * File Scanner Module
 * Handles directory scanning and file analysis
 */

const fs = require('fs');
const path = require('path');

// File type mapping
const fileTypeMap = {
    image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tga', '.psd'],
    script: ['.ts', '.js', '.json'],
    audio: ['.mp3', '.wav', '.ogg', '.m4a', '.aac'],
    model: ['.fbx', '.gltf', '.glb', '.obj', '.dae'],
    prefab: ['.prefab'],
    meta: ['.meta'],
    material: ['.mtl', '.material'],
    animation: ['.anim', '.animation'],
    scene: ['.scene', '.fire']
};

/**
 * Get file type based on extension
 * @param {string} filename
 * @returns {string}
 */
function getFileType(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    for (const [type, exts] of Object.entries(fileTypeMap)) {
        if (exts.includes(ext)) return type;
    }
    return 'other';
}

/**
 * Scan directory recursively
 * @param {string} dir - Directory path to scan
 * @returns {object} - Scan results with files, folderTree, typeStats
 */
function scanDirectory(dir) {
    const files = [];
    const folderTree = { name: path.basename(dir), children: {}, size: 0, fileCount: 0 };
    const typeStats = {};

    function scan(currentDir, currentTree, relativePath) {
        let items;
        try { items = fs.readdirSync(currentDir); } catch { return; }

        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const relPath = relativePath ? `${relativePath}/${item}` : item;

            let stat;
            try { stat = fs.statSync(fullPath); } catch { continue; }

            if (stat.isDirectory()) {
                if (item.startsWith('.') || item === 'node_modules') continue;
                currentTree.children[item] = { name: item, children: {}, size: 0, fileCount: 0 };
                scan(fullPath, currentTree.children[item], relPath);
                currentTree.size += currentTree.children[item].size;
                currentTree.fileCount += currentTree.children[item].fileCount;
            } else {
                const size = stat.size;
                const type = getFileType(item);
                files.push({ name: item, path: relPath, size, type });
                currentTree.size += size;
                currentTree.fileCount++;
                if (!typeStats[type]) typeStats[type] = { count: 0, size: 0 };
                typeStats[type].count++;
                typeStats[type].size += size;
            }
        }
    }

    scan(dir, folderTree, '');
    return { files, folderTree, typeStats, scannedAt: new Date().toISOString(), rootPath: dir };
}

module.exports = {
    fileTypeMap,
    getFileType,
    scanDirectory
};
