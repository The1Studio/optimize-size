/**
 * Image Compression Module
 * Compress PNG/JPG images using sharp
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

/**
 * Compress a single image file
 * @param {string} filePath - Absolute path to image
 * @param {object} options - Compression options
 * @returns {Promise<{success: boolean, originalSize: number, newSize: number, saved: number}>}
 */
async function compressImage(filePath, options = {}) {
    try {
        const {
            quality = 80,
            maxWidth = null,
            maxHeight = null
        } = options;

        // Get original size
        const stats = await fs.stat(filePath);
        const originalSize = stats.size;

        // Read image
        let image = sharp(filePath);
        const metadata = await image.metadata();

        // Resize if needed
        if (maxWidth || maxHeight) {
            image = image.resize(maxWidth, maxHeight, {
                fit: 'inside',
                withoutEnlargement: true
            });
        }

        // Compress based on format
        if (metadata.format === 'png') {
            image = image.png({ compressionLevel: 9, quality });
        } else if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
            image = image.jpeg({ quality, mozjpeg: true });
        } else if (metadata.format === 'webp') {
            image = image.webp({ quality });
        } else {
            // For unsupported formats, just return original
            return {
                success: true,
                originalSize,
                newSize: originalSize,
                saved: 0,
                skipped: true,
                reason: 'Unsupported format for compression'
            };
        }

        // Save to temp buffer first
        const buffer = await image.toBuffer();
        const newSize = buffer.length;

        // Only save if compressed version is smaller
        if (newSize < originalSize) {
            await fs.writeFile(filePath, buffer);
            return {
                success: true,
                originalSize,
                newSize,
                saved: originalSize - newSize,
                skipped: false
            };
        } else {
            return {
                success: true,
                originalSize,
                newSize: originalSize,
                saved: 0,
                skipped: true,
                reason: 'Compressed version is larger'
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            originalSize: 0,
            newSize: 0,
            saved: 0
        };
    }
}

/**
 * Compress all images in a directory
 * @param {string} rootDir - Root directory to scan
 * @param {object} options - Compression options
 * @param {function} progressCallback - Progress callback
 * @returns {Promise<object>} - Compression results
 */
async function compressDirectory(rootDir, options = {}, progressCallback = null) {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
    const results = {
        total: 0,
        compressed: 0,
        skipped: 0,
        failed: 0,
        originalSize: 0,
        newSize: 0,
        savedSize: 0,
        files: []
    };

    async function scanDir(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await scanDir(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (imageExtensions.includes(ext)) {
                    results.total++;

                    if (progressCallback) {
                        progressCallback({
                            current: results.total,
                            file: path.relative(rootDir, fullPath)
                        });
                    }

                    const result = await compressImage(fullPath, options);

                    results.originalSize += result.originalSize;
                    results.newSize += result.newSize;
                    results.savedSize += result.saved;

                    if (result.success) {
                        if (result.skipped) {
                            results.skipped++;
                        } else {
                            results.compressed++;
                        }
                    } else {
                        results.failed++;
                    }

                    results.files.push({
                        path: path.relative(rootDir, fullPath),
                        ...result
                    });
                }
            }
        }
    }

    await scanDir(rootDir);
    return results;
}

/**
 * Get compression estimate (dry run)
 * @param {string} rootDir - Root directory
 * @returns {Promise<object>} - Estimation results
 */
async function estimateCompression(rootDir) {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
    let totalImages = 0;
    let totalSize = 0;
    const files = [];

    async function scanDir(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await scanDir(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (imageExtensions.includes(ext)) {
                    const stats = await fs.stat(fullPath);
                    totalImages++;
                    totalSize += stats.size;
                    files.push({
                        path: path.relative(rootDir, fullPath),
                        size: stats.size
                    });
                }
            }
        }
    }

    await scanDir(rootDir);

    return {
        totalImages,
        totalSize,
        estimatedSaving: Math.floor(totalSize * 0.3), // Estimate 30% reduction
        files
    };
}

module.exports = {
    compressImage,
    compressDirectory,
    estimateCompression
};
