/**
 * Electron main process — boots the Express backend in-process and shows the
 * dashboard in a window. No terminal, no separate server.
 *
 * Data (SQLite, optional .env) lives in the OS user-data dir so it survives
 * app updates:  %APPDATA%/Investment Dashboard/data   (Windows)
 *
 * Closing the window hides it to the system tray; the backend keeps running and
 * a timer polls for target / stop-loss price alerts during market hours,
 * raising a desktop notification when one triggers. Quit from the tray menu.
 */
const { app, BrowserWindow, shell, Menu, Tray, Notification, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const APP_ROOT = path.join(__dirname, '..'); // resources/app  (packaged) or repo root (dev)
const ICON = path.join(__dirname, 'resources', 'icon.ico');
const dataDir = path.join(app.getPath('userData'), 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Backend reads these before its config module initialises.
process.env.NODE_ENV = 'production';
process.env.INVESTMENT_DATA_DIR = dataDir;
process.env.DOTENV_CONFIG_PATH = path.join(dataDir, '.env'); // drop GEMINI_API_KEY=... here
process.env.SERVE_FRONTEND = path.join(APP_ROOT, 'frontend', 'dist');

const START_HIDDEN = process.argv.includes('--hidden');
const POLL_MS = 10 * 60 * 1000; // background alert check cadence

let serverClose = null;
let serverUrl = null;
let win = null;
let tray = null;
let pollTimer = null;
let quitting = false;
const notifiedIds = new Set(); // alert ids we've already raised a toast for

async function boot() {
  const serverEntry = path.join(APP_ROOT, 'backend', 'dist', 'server.js');
  const { startServer } = await import('file://' + serverEntry.replace(/\\/g, '/'));
  const running = await startServer({ port: 0 }); // OS-assigned free port
  serverClose = running.close;
  serverUrl = running.url;
  console.log(`[electron] backend on ${running.url}  ·  data: ${dataDir}`);
  return running.url;
}

function createWindow(url) {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    show: !START_HIDDEN,
    backgroundColor: '#111015',
    title: 'Investment Dashboard',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(url);

  // Closing hides to tray instead of quitting (unless we're really quitting).
  win.on('close', (e) => {
    if (!quitting && tray) {
      e.preventDefault();
      win.hide();
    }
  });

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

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  try {
    let img = nativeImage.createFromPath(ICON);
    if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
    tray = new Tray(img.isEmpty() ? ICON : img);
  } catch (err) {
    console.warn('[electron] tray unavailable — window will quit on close:', err && err.message);
    return;
  }
  tray.setToolTip('Investment Dashboard');
  tray.on('click', showWindow);
  refreshTrayMenu();
}

function refreshTrayMenu(unacked = 0) {
  if (!tray) return;
  const startAtLogin = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: unacked ? `${unacked} unread alert${unacked > 1 ? 's' : ''}` : 'No unread alerts', enabled: false },
      { type: 'separator' },
      { label: 'Open dashboard', click: showWindow },
      { label: 'Check alerts now', click: () => pollAlerts(true) },
      {
        label: 'Start at login',
        type: 'checkbox',
        checked: startAtLogin,
        click: (item) =>
          app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] }),
      },
      { type: 'separator' },
      { label: 'Quit', click: quitApp },
    ]),
  );
}

function updateBadge(unacked) {
  try {
    app.setBadgeCount(unacked || 0);
  } catch {
    /* unsupported platform */
  }
  if (tray) {
    tray.setToolTip(
      unacked
        ? `Investment Dashboard — ${unacked} unread alert${unacked > 1 ? 's' : ''}`
        : 'Investment Dashboard',
    );
    refreshTrayMenu(unacked);
  }
}

/** Only weekdays, roughly during the TW cash session or the US session (Taipei time). */
function inMarketHours() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === 'weekday').value;
  let h = Number(parts.find((p) => p.type === 'hour').value);
  if (h === 24) h = 0;
  if (h < 5) return wd !== 'Sun'; // US session spills into the early morning (incl. Sat)
  if (wd === 'Sat' || wd === 'Sun') return false;
  const twSession = h >= 9 && h < 14;
  const usSession = h >= 21;
  return twSession || usSession;
}

/**
 * Refresh data + run alert detection, raising a desktop notification for each
 * newly-triggered alert. Skipped while the window is visible (the renderer polls
 * and notifies itself) and outside market hours — `force` overrides both.
 */
async function pollAlerts(force = false) {
  if (!serverUrl) return;
  if (!force && win && win.isVisible() && !win.isMinimized()) return;
  if (!force && !inMarketHours()) return;
  try {
    const res = await fetch(serverUrl + '/api/refresh', { method: 'POST' });
    const data = await res.json();
    const alerts = (data && data.alerts) || {};
    updateBadge(alerts.unacked || 0);
    for (const a of alerts.triggered || []) {
      if (notifiedIds.has(a.id)) continue;
      notifiedIds.add(a.id);
      if (!Notification.isSupported()) continue;
      const verb = a.kind === 'target' ? 'hit target' : 'hit stop-loss';
      const n = new Notification({
        title: `${a.ticker} ${verb}`,
        body: `${a.price} ${a.currency || ''} · ${a.kind === 'target' ? '≥' : '≤'} ${a.threshold}`,
      });
      n.on('click', showWindow);
      n.show();
    }
  } catch (err) {
    console.warn('[electron] alert poll failed:', err && err.message);
  }
}

async function quitApp() {
  if (quitting) return;
  quitting = true;
  if (pollTimer) clearInterval(pollTimer);
  if (serverClose) await serverClose().catch(() => {});
  app.quit();
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.peich.investment-dashboard');

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
        submenu: [{ label: 'Open data folder', click: () => shell.openPath(dataDir) }],
      },
    ]),
  );

  try {
    const url = await boot();
    createWindow(url);
    createTray();
    pollTimer = setInterval(() => pollAlerts(false), POLL_MS);
  } catch (err) {
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Investment Dashboard failed to start',
      String(err && err.stack ? err.stack : err),
    );
    app.quit();
  }
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('second-instance', showWindow);

app.on('window-all-closed', () => {
  // With the tray active the window only hides, so this fires only on real quit.
  quitApp();
});
