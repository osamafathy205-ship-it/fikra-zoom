/**
 * Fikra Academy - Electron Main Process
 * Handles: Window management, Custom Protocol Handler (fikra://),
 * IPC events, and application lifecycle
 */

const { app, BrowserWindow, ipcMain, protocol, shell, dialog, screen } = require('electron')
const path = require('path')
const url = require('url')

// ─── Environment Detection ────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ─── Start Backend Server (Production Only) ───────────────────────────────────
if (!isDev) {
  try {
    require('../server/index.js')
    console.log('[Fikra] Signaling server initialized successfully')
  } catch (err) {
    console.error('[Fikra] Local server startup error:', err)
  }
}

// ─── Protocol Registration ────────────────────────────────────────────────────
// Must be called BEFORE app is ready
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('fikra', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('fikra')
}

// ─── Single Instance Lock ─────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock()

let mainWindow = null
let pendingDeepLink = null

// ─── Window Factory ───────────────────────────────────────────────────────────
function createMainWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.min(1400, screenWidth),
    height: Math.min(900, screenHeight),
    minWidth: 900,
    minHeight: 600,
    center: true,
    frame: false,              // Custom titlebar
    transparent: false,
    backgroundColor: '#0D1229',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,                  // Allow media device access in file:// context
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
    },
    show: false,               // Show only when ready
    titleBarStyle: 'hidden',
  })

  // ─── Load App URL ─────────────────────────────────────────────────────────
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // Open DevTools in development
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // ─── Grant Camera/Mic/Screen Permissions ─────────────────────────────────
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'geolocation', 'notifications', 'fullscreen', 'display-capture']
    if (allowedPermissions.includes(permission)) {
      callback(true)
    } else {
      callback(false)
    }
  })

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return true  // Allow all permission checks
  })

  // ─── Window Events ────────────────────────────────────────────────────────
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()

    // If there was a pending deep link (app launched via protocol), process it
    if (pendingDeepLink) {
      handleDeepLink(pendingDeepLink)
      pendingDeepLink = null
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    if (parsedUrl.origin !== 'http://localhost:5173' && !navigationUrl.startsWith('file://')) {
      event.preventDefault()
      shell.openExternal(navigationUrl)
    }
  })

  return mainWindow
}

// ─── Deep Link Handler ────────────────────────────────────────────────────────
function handleDeepLink(deepLinkUrl) {
  console.log('[Fikra] Deep link received:', deepLinkUrl)

  try {
    // Parse fikra://join/MEETING_ID or fikra://join?id=MEETING_ID
    const parsed = new URL(deepLinkUrl)
    const action = parsed.hostname  // e.g., "join"
    const pathParts = parsed.pathname.split('/').filter(Boolean)

    let meetingId = pathParts[0] || parsed.searchParams.get('id') || null
    let role = parsed.searchParams.get('role') || 'student'
    let name = parsed.searchParams.get('name') || null

    if (action === 'join' && meetingId) {
      const payload = { meetingId, role, name }
      console.log('[Fikra] Joining meeting:', payload)

      if (mainWindow && mainWindow.webContents) {
        // Restore window if minimized
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
        mainWindow.webContents.send('deep-link-join', payload)
      } else {
        pendingDeepLink = deepLinkUrl
      }
    } else if (action === 'host' && meetingId) {
      const payload = { meetingId, role: 'host' }
      if (mainWindow && mainWindow.webContents) {
        mainWindow.focus()
        mainWindow.webContents.send('deep-link-join', payload)
      } else {
        pendingDeepLink = deepLinkUrl
      }
    }
  } catch (err) {
    console.error('[Fikra] Deep link parse error:', err)
  }
}

// ─── Single Instance: Second launch handler ───────────────────────────────────
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Windows: second-instance sends command line args
    const deepLink = commandLine.find(arg => arg.startsWith('fikra://'))
    if (deepLink) {
      handleDeepLink(deepLink)
    }

    // Restore main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // ─── App Ready ─────────────────────────────────────────────────────────────
  app.whenReady().then(() => {
    createMainWindow()

    // macOS: handle open-url event
    app.on('open-url', (event, openUrl) => {
      event.preventDefault()
      handleDeepLink(openUrl)
    })

    // Handle Windows deep link from command line args
    const argv = process.argv
    const deepLinkArg = argv.find(arg => arg.startsWith('fikra://'))
    if (deepLinkArg) {
      pendingDeepLink = deepLinkArg
    }
  })
}

// ─── App Events ───────────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close()
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false
})

// Screen sharing
ipcMain.handle('get-sources', async () => {
  const { desktopCapturer } = require('electron')
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 },
  })
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }))
})

// Notifications
ipcMain.on('show-notification', (event, { title, body }) => {
  const { Notification } = require('electron')
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, '../assets/icon.png') }).show()
  }
})

// App info
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// Open external URL
ipcMain.on('open-external', (event, externalUrl) => {
  shell.openExternal(externalUrl)
})

// Get Local IP
ipcMain.handle('get-local-ip', () => {
  const os = require('os')
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
})

// Dialog
ipcMain.handle('show-dialog', async (event, options) => {
  return await dialog.showMessageBox(mainWindow, options)
})

console.log('[Fikra Academy] Main process started')
console.log('[Fikra Academy] isDev:', isDev)
