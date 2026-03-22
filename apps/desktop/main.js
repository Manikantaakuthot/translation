const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  const webUrl = process.env.WEB_URL || 'http://localhost:5173';
  const distPath = path.join(__dirname, '..', 'web', 'dist', 'index.html');

  if (isDev) {
    win.loadURL(webUrl);
    win.webContents.openDevTools();
  } else {
    win.loadFile(distPath);
  }

  win.on('closed', () => {
    app.quit();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
