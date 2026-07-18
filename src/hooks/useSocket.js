/**
 * Fikra Academy - Singleton Socket Manager
 *
 * A single shared socket connection is maintained for the entire app lifetime.
 * Every component that calls useSocket() gets access to THE SAME socket instance.
 * This prevents the "student kicked immediately" bug caused by creating a new
 * socket on each page navigation (WaitingRoom → LectureRoom).
 */

import { io } from 'socket.io-client'
import { useEffect, useCallback, useState, useRef } from 'react'
import { getServerUrl } from '../config.js'

// ─── Singleton Socket ──────────────────────────────────────────────────────────
let _socket = null
let _connected = false
const _listeners = new Set()

function getSocket() {
  if (_socket) return _socket

  const serverUrl = getServerUrl()
  console.log('[Socket] Creating singleton connection to:', serverUrl)

  _socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    timeout: 20000,
    autoConnect: true,
  })

  _socket.on('connect', () => {
    console.log('[Socket] Connected:', _socket.id)
    _connected = true
    _listeners.forEach(fn => fn(true))
  })

  _socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
    _connected = false
    _listeners.forEach(fn => fn(false))
  })

  _socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message)
    _connected = false
    _listeners.forEach(fn => fn(false))
  })

  return _socket
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSocket() {
  const socket = getSocket()
  const socketRef = useRef(socket)
  socketRef.current = socket

  const [connected, setConnected] = useState(_connected)

  useEffect(() => {
    // Sync with current state immediately
    setConnected(_connected)

    const listener = (state) => setConnected(state)
    _listeners.add(listener)
    return () => _listeners.delete(listener)
  }, [])

  const emit = useCallback((event, data) => {
    const s = getSocket()
    if (s?.connected) {
      s.emit(event, data)
    } else {
      console.warn('[Socket] Cannot emit (not connected):', event)
    }
  }, [])

  const on = useCallback((event, handler) => {
    const s = getSocket()
    if (!s) return () => {}
    s.on(event, handler)
    return () => s.off(event, handler)
  }, [])

  return { socket, socketRef, connected, emit, on }
}
