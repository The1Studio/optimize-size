/**
 * Simple Electron Test
 */

const { app, BrowserWindow } = require('electron');

console.log('[TEST] app:', typeof app);
console.log('[TEST] BrowserWindow:', typeof BrowserWindow);

app.whenReady().then(() => {
    console.log('[TEST] Electron is ready!');

    const win = new BrowserWindow({
        width: 800,
        height: 600
    });

    win.loadURL('https://electronjs.org');
});

app.on('window-all-closed', () => {
    app.quit();
});
