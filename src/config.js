/**
 * Fikra Academy - Application Configuration
 * This file stores the cloud server URL for production deployment.
 * When deployed to Render.com, update CLOUD_SERVER_URL with your Render URL.
 */

// ⚠️ IMPORTANT: After deploying to Render.com, replace this URL with your actual Render URL
// Example: 'https://fikra-academy.onrender.com'
export const CLOUD_SERVER_URL = 'https://fikra-academy.onrender.com'

// In development, the server runs locally
export const DEV_SERVER_URL = 'http://localhost:3001'

/**
 * Returns the correct server URL based on the current environment
 */
export function getServerUrl() {
  // 1. Browser accessing via cloud URL (student on phone/PC)
  if (typeof window !== 'undefined' && !window.location.protocol.startsWith('file')) {
    const hostname = window.location.hostname
    
    // Development: Vite dev server on port 5173
    if (window.location.port === '5173') {
      return `http://${hostname}:3001`
    }
    
    // Production/Cloud: same origin (Render, ngrok, etc.)
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return window.location.origin
    }
  }

  // 2. Electron app (packaged .exe) → always connect to cloud
  if (typeof window !== 'undefined' && window.fikraElectron) {
    return CLOUD_SERVER_URL
  }

  // 3. Fallback: local development
  return DEV_SERVER_URL
}

/**
 * Returns the student-facing invite URL for a given meeting
 */
export function getInviteUrl(meetingId) {
  return `${CLOUD_SERVER_URL}/#/waiting/${meetingId}`
}
