/**
 * Electron Preload Script
 * Exposes native dialog APIs to renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// native dialogs without exposing the entire Electron API
contextBridge.exposeInMainWorld('electronAPI', {
    // Select folder for changing root directory
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

    // Select folder for optimization
    selectOptimizeFolder: () => ipcRenderer.invoke('dialog:selectOptimizeFolder')
});
