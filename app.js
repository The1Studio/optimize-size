/**
 * File Size Analyzer - Desktop App
 * Chay: node app.js
 * Tu dong quet assets/ va mo giao dien web
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { scanDirectory } = require('./src/scanner');
const { compressDirectory, estimateCompression } = require('./src/compressor');

const PORT = 3456;
const ROOT_DIR = path.resolve(__dirname, '../../assets');
const PUBLIC_DIR = path.resolve(__dirname, 'public');

// MIME types for static files
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json'
};

/**
 * Serve static file
 * @param {string} filePath
 * @param {http.ServerResponse} res
 */
function serveStatic(filePath, res) {
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
    const url = req.url;

    // API: Scan directory
    if (url === '/api/scan') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(scanDirectory(ROOT_DIR)));
        return;
    }

    // API: Estimate compression
    if (url === '/api/compress/estimate') {
        try {
            const estimate = await estimateCompression(ROOT_DIR);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(estimate));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }

    // API: Get image metadata
    if (url === '/api/image/metadata' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { filePath } = JSON.parse(body);
                const fullPath = path.resolve(ROOT_DIR, filePath);

                // Security check: ensure path is within ROOT_DIR
                if (!fullPath.startsWith(ROOT_DIR)) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid path' }));
                    return;
                }

                const sharp = require('sharp');
                const image = sharp(fullPath);
                const metadata = await image.metadata();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    width: metadata.width,
                    height: metadata.height,
                    format: metadata.format
                }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // API: Resize single image
    if (url === '/api/resize/single' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { filePath, width, height } = JSON.parse(body);
                const fullPath = path.resolve(ROOT_DIR, filePath);

                // Security check: ensure path is within ROOT_DIR
                if (!fullPath.startsWith(ROOT_DIR)) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid path' }));
                    return;
                }

                const sharp = require('sharp');
                const fs = require('fs').promises;

                // Get original size and dimensions
                const stats = await fs.stat(fullPath);
                const originalSize = stats.size;

                const image = sharp(fullPath);
                const metadata = await image.metadata();

                // Check if size actually changed
                if (metadata.width === width && metadata.height === height) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        skipped: true,
                        reason: 'Image already has the requested dimensions',
                        originalSize,
                        newSize: originalSize,
                        saved: 0,
                        originalWidth: metadata.width,
                        originalHeight: metadata.height,
                        newWidth: width,
                        newHeight: height
                    }));
                    return;
                }

                // Resize image to exact dimensions with lossless settings
                let resizedImage = image.resize(width, height, {
                    fit: 'fill'
                });

                // Preserve original format and quality
                if (metadata.format === 'png') {
                    resizedImage = resizedImage.png({
                        compressionLevel: 9,
                        quality: 100
                    });
                } else if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
                    resizedImage = resizedImage.jpeg({
                        quality: 95,
                        mozjpeg: true
                    });
                } else if (metadata.format === 'webp') {
                    resizedImage = resizedImage.webp({
                        quality: 95,
                        lossless: false
                    });
                }

                const resizedBuffer = await resizedImage.toBuffer();
                const newMetadata = await sharp(resizedBuffer).metadata();

                // Save resized image
                await fs.writeFile(fullPath, resizedBuffer);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    skipped: false,
                    originalSize,
                    newSize: resizedBuffer.length,
                    saved: originalSize - resizedBuffer.length,
                    originalWidth: metadata.width,
                    originalHeight: metadata.height,
                    newWidth: newMetadata.width,
                    newHeight: newMetadata.height
                }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // API: Compress single image
    if (url === '/api/compress/single' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { filePath, quality = 80 } = JSON.parse(body);
                const fullPath = path.resolve(ROOT_DIR, filePath);

                // Security check: ensure path is within ROOT_DIR
                if (!fullPath.startsWith(ROOT_DIR)) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid path' }));
                    return;
                }

                const { compressImage } = require('./src/compressor');
                const result = await compressImage(fullPath, { quality });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // API: Compress images
    if (url === '/api/compress/run' && req.method === 'POST') {
        try {
            // Parse body for options
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                const options = body ? JSON.parse(body) : {};

                // Send headers for Server-Sent Events
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });

                // Progress callback
                const progressCallback = (progress) => {
                    res.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
                };

                try {
                    const results = await compressDirectory(ROOT_DIR, options, progressCallback);
                    res.write(`data: ${JSON.stringify({ type: 'complete', results })}\n\n`);
                    res.end();
                } catch (error) {
                    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
                    res.end();
                }
            });
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }

    // Static files
    let filePath = path.join(PUBLIC_DIR, url === '/' ? 'index.html' : url);
    serveStatic(filePath, res);
});

server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  File Size Analyzer`);
    console.log(`  Scanning: ${ROOT_DIR}`);
    console.log(`  Open: ${url}\n`);

    // Auto open browser
    const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} ${url}`);
});
