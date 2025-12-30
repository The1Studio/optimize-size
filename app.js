/**
 * File Size Analyzer - Desktop App
 * Chay: node app.js
 * Tu dong quet assets/ va mo giao dien web
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { scanDirectory } = require('./src/scanner');
const { compressDirectory, estimateCompression } = require('./src/compressor');
const { compressAudioDirectory, estimateAudioCompression } = require('./src/audioCompressor');

const PORT = 3456;
let ROOT_DIR = path.resolve(__dirname, '../../assets');
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const OPTIMIZE_DATA_DIR = '.optimize-data';
const TAGS_FILE = 'tags.json';

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

                // Calculate final dimensions
                let finalWidth = width;
                let finalHeight = height;

                // If only width provided, calculate height maintaining aspect ratio
                if (width && !height) {
                    const aspectRatio = metadata.height / metadata.width;
                    finalHeight = Math.round(width * aspectRatio);
                }
                // If only height provided, calculate width maintaining aspect ratio
                else if (height && !width) {
                    const aspectRatio = metadata.width / metadata.height;
                    finalWidth = Math.round(height * aspectRatio);
                }

                // Check if size actually changed
                if (metadata.width === finalWidth && metadata.height === finalHeight) {
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
                        newWidth: finalWidth,
                        newHeight: finalHeight
                    }));
                    return;
                }

                // Resize image - maintain aspect ratio if only one dimension provided
                const resizedBuffer = await image
                    .resize(finalWidth, finalHeight, {
                        fit: 'fill'
                    })
                    .toBuffer();
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

    // API: Set root directory
    if (url === '/api/set-root' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { rootPath } = JSON.parse(body);
                const newRootPath = path.resolve(rootPath);

                // Check if directory exists
                const fs = require('fs');
                if (!fs.existsSync(newRootPath)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Directory does not exist' }));
                    return;
                }

                // Update ROOT_DIR
                ROOT_DIR = newRootPath;

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, rootPath: ROOT_DIR }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // API: Get tags
    if (url === '/api/tags/get' && req.method === 'GET') {
        try {
            const dataDir = path.join(ROOT_DIR, OPTIMIZE_DATA_DIR);
            const tagsFilePath = path.join(dataDir, TAGS_FILE);

            // Check if tags file exists
            if (!fs.existsSync(tagsFilePath)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, tags: {} }));
                return;
            }

            // Read tags file
            const tagsData = fs.readFileSync(tagsFilePath, 'utf8');
            const tags = JSON.parse(tagsData);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tags }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: error.message }));
        }
        return;
    }

    // API: Save tags
    if (url === '/api/tags/save' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { tags } = JSON.parse(body);
                const dataDir = path.join(ROOT_DIR, OPTIMIZE_DATA_DIR);
                const tagsFilePath = path.join(dataDir, TAGS_FILE);

                // Create .optimize-data directory if it doesn't exist
                if (!fs.existsSync(dataDir)) {
                    fs.mkdirSync(dataDir, { recursive: true });
                }

                // Write tags to file
                fs.writeFileSync(tagsFilePath, JSON.stringify(tags, null, 2), 'utf8');

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // API: Native folder dialog (Windows)
    if (url === '/api/native-folder-dialog' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { initialPath } = JSON.parse(body);
                const { exec } = require('child_process');
                const scriptPath = path.join(__dirname, 'src', 'folder-dialog.ps1');

                // Build PowerShell command
                const psCommand = `powershell -ExecutionPolicy Bypass -File "${scriptPath}" "${initialPath || ROOT_DIR}"`;

                exec(psCommand, (error, stdout, stderr) => {
                    if (error) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: error.message }));
                        return;
                    }

                    const selectedPath = stdout.trim();

                    if (selectedPath) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            path: selectedPath
                        }));
                    } else {
                        // User cancelled
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, cancelled: true }));
                    }
                });
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // API: List directories
    if (url === '/api/list-directories' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { dirPath } = JSON.parse(body);
                let targetDir = dirPath ? path.resolve(dirPath) : ROOT_DIR;

                // Security check: for relative paths, ensure they're within ROOT_DIR
                if (dirPath && !path.isAbsolute(dirPath)) {
                    targetDir = path.resolve(ROOT_DIR, dirPath);
                    if (!targetDir.startsWith(ROOT_DIR)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Invalid path' }));
                        return;
                    }
                }

                // Check if directory exists
                if (!fs.existsSync(targetDir)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Directory does not exist' }));
                    return;
                }

                // Read directory contents
                const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
                const directories = entries
                    .filter(entry => entry.isDirectory())
                    .map(entry => ({
                        name: entry.name,
                        path: path.join(targetDir, entry.name)
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    currentPath: targetDir,
                    parentPath: path.dirname(targetDir),
                    directories
                }));
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
                const { targetPath } = options;

                // Determine directory to compress
                let compressDir = ROOT_DIR;
                if (targetPath) {
                    compressDir = path.resolve(ROOT_DIR, targetPath);

                    // Security check: ensure path is within ROOT_DIR
                    if (!compressDir.startsWith(ROOT_DIR)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid path' }));
                        return;
                    }

                    // Check if directory exists
                    const fs = require('fs');
                    if (!fs.existsSync(compressDir)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Directory does not exist' }));
                        return;
                    }
                }

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
                    const results = await compressDirectory(compressDir, options, progressCallback);
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

    // API: Estimate audio compression
    if (url === '/api/audio/estimate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { targetPath } = body ? JSON.parse(body) : {};
                let audioDir = ROOT_DIR;

                if (targetPath) {
                    audioDir = path.resolve(ROOT_DIR, targetPath);

                    // Security check
                    if (!fs.existsSync(audioDir)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Directory does not exist' }));
                        return;
                    }
                }

                const estimate = await estimateAudioCompression(audioDir);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(estimate));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // API: Compress single audio file
    if (url === '/api/audio/compress/single' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { filePath, bitrate, channels, format } = JSON.parse(body);
                const fullPath = path.resolve(ROOT_DIR, filePath);

                // Security check
                if (!fullPath.startsWith(ROOT_DIR)) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid path' }));
                    return;
                }

                const { compressAudio } = require('./src/audioCompressor');
                const result = await compressAudio(fullPath, {
                    bitrate: bitrate || '96k',
                    channels: channels || null,
                    format: format || null
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // API: Compress audio
    if (url === '/api/audio/compress' && req.method === 'POST') {
        try {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                const options = body ? JSON.parse(body) : {};
                const { targetPath, bitrate, sampleRate, channels, format } = options;

                // Determine directory to compress
                let compressDir = ROOT_DIR;
                if (targetPath) {
                    compressDir = path.resolve(ROOT_DIR, targetPath);

                    // Security check
                    if (!fs.existsSync(compressDir)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Directory does not exist' }));
                        return;
                    }
                }

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
                    const results = await compressAudioDirectory(compressDir, {
                        bitrate: bitrate || '96k',
                        sampleRate: sampleRate || null,
                        channels: channels || null,
                        format: format || null
                    }, progressCallback);
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

    // Auto open browser (disabled to prevent opening multiple tabs on restart)
    // const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    // exec(`${cmd} ${url}`);
});
