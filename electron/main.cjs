/**
 * Electron main process — boots the Express backend in-process and shows the
 * dashboard in a window. No terminal, no separate server.
 *
 * Data (SQLite, optional .env) lives in the OS user-data dir so it survives
 * app updates:  %APPDATA%/Investment Dashboard/data   (Windows)
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const APP_ROOT = path.join(__dirname, '..'); // resources/app  (packaged) or repo root (dev)
const dataDir = path.join(app.getPath('userData'), 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Backend reads these before its config module initialises.
process.env.NODE_ENV = 'production';
process.env.INVESTMENT_DATA_DIR = dataDir;
process.env.DOTENV_CONFIG_PATH = path.join(dataDir, '.env'); // drop ANTHROPIC_API_KEY=... here
process.env.SERVE_FRONTEND = path.join(APP_ROOT, 'frontend', 'dist');

let serverClose = null;
let win = null;

async function boot() {
  const serverEntry = path.join(APP_ROOT, 'backend', 'dist', 'server.js');
  const { startServer } = await import('file://' + serverEntry.replace(/\\/g, '/'));
  const running = await startServer({ port: 0 }); // OS-assigned free port
  serverClose = running.close;
  console.log(`[electron] backend on ${running.url}  ·  data: ${dataDir}`);
  return running.url;
}

function createWindow(url) {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#111015',
    title: 'Investment Dashboard',
    icon: path.join(__dirname, 'resources', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(url);

  // External links (news articles) open in the real browser, not the app window.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, target) => {
    if (!target.startsWith(url)) {
      e.preventDefault();
      shell.openExternal(target);
    }
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'fileMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }],
      },
      {
        label: 'Data',
        submenu: [
          {
            label: 'Open data folder',
            click: () => shell.openPath(dataDir),
          },
        ],
      },
    ]),
  );

  try {
    const url = await boot();
    createWindow(url);
  } catch (err) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Investment Dashboard failed to start', String(err && err.stack ? err.stack : err));
    app.quit();
  }
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', async () => {
  if (serverClose) await serverClose().catch(() => {});
  app.quit();
});
