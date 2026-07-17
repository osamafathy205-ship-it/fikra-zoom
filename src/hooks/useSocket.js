import { useEffect, useRef, useCallback, useState } from 'react'
import { io } from 'socket.io-client'
import { getServerUrl } from '../config.js'

/**
 * useSocket - Manages the Socket.io connection lifecycle
 * Returns the socket instance and connection state
 */
export function useSocket() {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const serverUrl = getServerUrl()
    console.log('[Socket] Connecting to:', serverUrl)

    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 15000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id)
      setConnected(true)
      setError(null)
    })

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
      setConnected(false)
    })

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message)
      setError(err.message)
      setConnected(false)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data)
    } else {
      console.warn('[Socket] Cannot emit, not connected:', event)
    }
  }, [])

  const on = useCallback((event, handler) => {
    const socket = socketRef.current
    if (!socket) return () => {}
    socket.on(event, handler)
    return () => socket.off(event, handler)
  }, [])

  return { socket: socketRef.current, socketRef, connected, error, emit, on }
}
