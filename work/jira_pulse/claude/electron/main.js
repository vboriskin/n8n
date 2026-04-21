// Electron main process
// - Creates the app window
// - Persists config + cache as JSON in userData
// - Proxies HTTP requests to Jira / Confluence / Bitbucket (bypasses renderer CORS)

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const axios = require('axios')

const isDev = !!process.env.VITE_DEV_SERVER_URL

// ---- persistence -----------------------------------------------------------

const userDataDir = app.getPath('userData')
const CONFIG_PATH = path.join(userDataDir, 'config.json')
const CACHE_PATH = path.join(userDataDir, 'cache.json')

function readJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    console.warn(`[main] readJSON failed for ${filePath}:`, err.message)
    return fallback
  }
}

function writeJSON(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error(`[main] writeJSON failed for ${filePath}:`, err.message)
    return false
  }
}

// ---- window ----------------------------------------------------------------

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b1220',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Open external links in the OS browser, not inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---- IPC: config + cache ---------------------------------------------------

ipcMain.handle('config:get', () => readJSON(CONFIG_PATH, {}))
ipcMain.handle('config:set', (_e, data) => writeJSON(CONFIG_PATH, data || {}))
ipcMain.handle('cache:get', () => readJSON(CACHE_PATH, {}))
ipcMain.handle('cache:set', (_e, data) => writeJSON(CACHE_PATH, data || {}))
ipcMain.handle('cache:clear', () => writeJSON(CACHE_PATH, {}))

// ---- IPC: HTTP proxy -------------------------------------------------------
// Renderer sends: { method, url, headers, params, data, timeout }
// Returns:       { ok, status, data, error }

ipcMain.handle('http:request', async (_e, opts = {}) => {
  const {
    method = 'GET',
    url,
    headers = {},
    params,
    data,
    timeout = 30000,
  } = opts

  if (!url) {
    return { ok: false, status: 0, error: 'url is required' }
  }

  try {
    const res = await axios({
      method,
      url,
      headers,
      params,
      data,
      timeout,
      // Don't throw on non-2xx — let the renderer decide.
      validateStatus: () => true,
      // Permit self-signed certs for on-prem Jira/Confluence when needed.
      // (Users may enable via NODE_TLS_REJECT_UNAUTHORIZED=0 env.)
    })
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      data: res.data,
      headers: res.headers,
    }
  } catch (err) {
    return {
      ok: false,
      status: err.response?.status || 0,
      error: err.message || String(err),
      data: err.response?.data,
    }
  }
})

// ---- lifecycle -------------------------------------------------------------

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
