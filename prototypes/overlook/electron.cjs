'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.setName('BugBistroOverlook');
app.setPath('userData', path.join(__dirname, '.runtime'));
app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1280, height: 720, minWidth: 960, minHeight: 540, useContentSize: true,
    title: 'Bug 小餐馆 · 全屏视角选型 Demo', backgroundColor: '#f7f8f2', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true }
  });
  window.setAspectRatio(16 / 9);
  window.setContentSize(1280, 720);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file:')) event.preventDefault(); });
  window.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
