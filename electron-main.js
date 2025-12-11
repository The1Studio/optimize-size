/**
 * Electron Main Process
 * Desktop application wrapper for File Size Analyzer
 */

/**
 * IMPORTANT: This file MUST be run by Electron, not Node.js
 * Run with: npm run electron or npx electron .
 */

// Only load Electron modules if running in Electron context
if (typeof process.versions.electron === 'undefined') {
    console.error('ERROR: This file must be run with Electron, not Node.js!');
    console.error('Use: npm run electron');
    process.exit(1);
}

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { scanDirectory } = require('./src/scanner');
const { compressDirectory, estimateCompression, compressImage } = require('./src/compressor');

const PORT = 3456;
let ROOT_DIR = path.resolve(__dirname, '../../assets');
const PUBLIC_DIR = path.resolve(__dirname, 'public');

let mainWindow;
let server;

// MIME types for static files
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json'
};

/**
 * Serve static file
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

/**
 * Create HTTP Server
 */
function createServer() {
    server = http.createServer(async (req, res) => {
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

                    if (!fullPath.startsWith(ROOT_DIR)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Invalid path' }));
                        return;
                    }

                    const sharp = require('sharp');
                    const stats = await fs.promises.stat(fullPath);
                    const originalSize = stats.size;

                    const image = sharp(fullPath);
                    const metadata = await image.metadata();

                    let finalWidth = width;
                    let finalHeight = height;

                    if (width && !height) {
                        const aspectRatio = metadata.height / metadata.width;
                        finalHeight = Math.round(width * aspectRatio);
                    } else if (height && !width) {
                        const aspectRatio = metadata.width / metadata.height;
                        finalWidth = Math.round(height * aspectRatio);
                    }

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

                    const resizedBuffer = await image
                        .resize(finalWidth, finalHeight, { fit: 'fill' })
                        .toBuffer();
                    const newMetadata = await sharp(resizedBuffer).metadata();

                    await fs.promises.writeFile(fullPath, resizedBuffer);

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

                    if (!fullPath.startsWith(ROOT_DIR)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Invalid path' }));
                        return;
                    }

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

                    if (!fs.existsSync(newRootPath)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Directory does not exist' }));
                        return;
                    }

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

        // API: List directories
        if (url === '/api/list-directories' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { dirPath } = JSON.parse(body);
                    let targetDir = dirPath ? path.resolve(dirPath) : ROOT_DIR;

                    if (dirPath && !path.isAbsolute(dirPath)) {
                        targetDir = path.resolve(ROOT_DIR, dirPath);
                        if (!targetDir.startsWith(ROOT_DIR)) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: 'Invalid path' }));
                            return;
                        }
                    }

                    if (!fs.existsSync(targetDir)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Directory does not exist' }));
                        return;
                    }

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
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    const options = body ? JSON.parse(body) : {};
                    const { targetPath } = options;

                    let compressDir = ROOT_DIR;
                    if (targetPath) {
                        compressDir = path.resolve(ROOT_DIR, targetPath);

                        if (!compressDir.startsWith(ROOT_DIR)) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid path' }));
                            return;
                        }

                        if (!fs.existsSync(compressDir)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Directory does not exist' }));
                            return;
                        }
                    }

                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });

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

        // Static files
        let filePath = path.join(PUBLIC_DIR, url === '/' ? 'index.html' : url);
        serveStatic(filePath, res);
    });

    server.listen(PORT, () => {
        console.log(`\n  File Size Analyzer - Electron`);
        console.log(`  Server running on: http://localhost:${PORT}`);
        console.log(`  Scanning: ${ROOT_DIR}\n`);
    });
}

/**
 * Create main window
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'electron-preload.js')
        },
        icon: path.join(__dirname, 'icon.png'), // Optional: add app icon
        title: '❤️ I Love Cocos - Build Size Analyzer',
        backgroundColor: '#1a1a2e',
        show: false // Don't show until ready
    });

    // Load the app
    mainWindow.loadURL(`http://localhost:${PORT}`);

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open DevTools in development (optional)
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * Setup IPC Handlers - Native dialogs
 */
function setupIPCHandlers() {
    // Select folder dialog
    ipcMain.handle('dialog:selectFolder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select Directory'
        });

        if (!result.canceled && result.filePaths.length > 0) {
            return { success: true, path: result.filePaths[0] };
        }
        return { success: false };
    });

    // Select folder for optimization
    ipcMain.handle('dialog:selectOptimizeFolder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select Directory to Optimize',
            defaultPath: ROOT_DIR
        });

        if (!result.canceled && result.filePaths.length > 0) {
            // Calculate relative path from ROOT_DIR
            const selectedPath = result.filePaths[0];
            let relativePath = '';
            if (selectedPath.startsWith(ROOT_DIR)) {
                relativePath = path.relative(ROOT_DIR, selectedPath);
            } else {
                relativePath = selectedPath;
            }
            return { success: true, path: selectedPath, relativePath };
        }
        return { success: false };
    });
}

/**
 * App lifecycle
 */

app.whenReady().then(() => {
    // Setup IPC handlers
    setupIPCHandlers();

    // Start HTTP server first
    createServer();

    // Wait a bit for server to start, then create window
    setTimeout(() => {
        createWindow();
    }, 500);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Close HTTP server
    if (server) {
        server.close();
    }

    // Quit app
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('quit', () => {
    if (server) {
        server.close();
    }
});
