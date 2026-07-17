/**
 * Fikra Academy - Preload Script
 * Safely exposes Electron APIs to the renderer process via contextBridge.
 * This is the ONLY bridge between the secure renderer and the main process.
 */

const { contextBridge, ipcRenderer } = require('electron')

// ─── Exposed API Surface ──────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('fikraElectron', {
  // ── Window Controls ─────────────────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },

  // ── Deep Link / Protocol Handler ─────────────────────────────────────────────
  protocol: {
    onDeepLink: (callback) => {
      const listener = (event, payload) => callback(payload)
      ipcRenderer.on('deep-link-join', listener)
      // Return cleanup function
      return () => ipcRenderer.removeListener('deep-link-join', listener)
    },
  },

  // ── Screen Sharing ───────────────────────────────────────────────────────────
  screen: {
    getSources: () => ipcRenderer.invoke('get-sources'),
  },

  // ── Notifications ────────────────────────────────────────────────────────────
  notify: (title, body) => ipcRenderer.send('show-notification', { title, body }),

  // ── App Info ─────────────────────────────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // ── External Links ───────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // ── Dialog ───────────────────────────────────────────────────────────────────
  showDialog: (options) => ipcRenderer.invoke('show-dialog', options),

  // ── Platform Info ────────────────────────────────────────────────────────────
  platform: process.platform,
  isElectron: true,
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
})

console.log('[Fikra] Preload script loaded ✓')
