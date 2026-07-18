/**
 * Fikra Academy - Application Configuration
 * This file stores the cloud server URL for production deployment.
 * When deployed to Render.com, update CLOUD_SERVER_URL with your Render URL.
 */

// ⚠️ IMPORTANT: After deploying to Render.com, replace this URL with your actual Render URL
// Example: 'https://fikra-academy.onrender.com'
export const CLOUD_SERVER_URL = 'https://fikra-zoom-production.up.railway.app'

// In development, the server runs locally
export const DEV_SERVER_URL = 'http://localhost:3001'

export function getServerUrl() {
  // 1. Browser accessing via cloud/local URL (student on phone/PC)
  if (typeof window !== 'undefined' && !window.location.protocol.startsWith('file')) {
    const hostname = window.location.hostname
    
    // Development: Vite dev server on port 5173
    if (window.location.port === '5173') {
      return `http://${hostname}:3001`
    }
    
    // Production/Cloud: same origin (Render, ngrok, localtunnel, etc.)
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return window.location.origin
    }
  }

  // 2. Electron app (packaged .exe)
  if (typeof window !== 'undefined' && window.fikraElectron) {
    // If the CLOUD_SERVER_URL is configured and is NOT the default placeholder, use it.
    // Otherwise, connect to the local server running on the same PC (start-with-tunnel.bat mode).
    if (CLOUD_SERVER_URL && CLOUD_SERVER_URL !== 'https://fikra-academy.onrender.com' && CLOUD_SERVER_URL !== '') {
      return CLOUD_SERVER_URL
    }
    return 'http://localhost:3001'
  }

  // 3. Fallback: local development
  return DEV_SERVER_URL
}

/**
 * Returns the student-facing invite URL for a given meeting
 */
export function getInviteUrl(meetingId) {
  // If cloud URL is the placeholder, return a helper instructions text for localtunnel mode
  if (CLOUD_SERVER_URL === 'https://fikra-academy.onrender.com' || CLOUD_SERVER_URL === '') {
    return `[انسخ رابط localtunnel المطبوع في المربع الأسود وضع في نهايته /#/waiting/${meetingId}]`
  }
  return `${CLOUD_SERVER_URL}/#/waiting/${meetingId}`
}
