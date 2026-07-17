import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useMedia - Manages camera, microphone, and screen sharing streams
 */
export function useMedia() {
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const [localStream, setLocalStream] = useState(null)

  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isSharingScreen, setIsSharingScreen] = useState(false)
  const [hasMedia, setHasMedia] = useState(false)
  const [mediaError, setMediaError] = useState(null)

  // ── Initialize camera + mic ───────────────────────────────────────────────
  const initMedia = useCallback(async (videoEnabled = true, audioEnabled = true) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        } : false,
        audio: audioEnabled ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : false,
      })

      localStreamRef.current = stream
      setLocalStream(stream)
      setHasMedia(true)
      setIsMuted(!audioEnabled)
      setIsVideoOff(!videoEnabled)
      setMediaError(null)
      return stream
    } catch (err) {
      console.error('[Media] getUserMedia error:', err)
      setMediaError(err.message)
      setHasMedia(false)
      return null
    }
  }, [])

  // ── Toggle Microphone ─────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return false

    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) return false

    const newMuted = !isMuted
    audioTrack.enabled = !newMuted
    setIsMuted(newMuted)
    return newMuted
  }, [isMuted])

  // ── Force Mute (from host) ────────────────────────────────────────────────
  const forceMute = useCallback((muted) => {
    const stream = localStreamRef.current
    if (!stream) return

    const audioTrack = stream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !muted
      setIsMuted(muted)
    }
  }, [])

  // ── Toggle Video ──────────────────────────────────────────────────────────
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return false

    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return false

    const newVideoOff = !isVideoOff
    videoTrack.enabled = !newVideoOff
    setIsVideoOff(newVideoOff)
    return newVideoOff
  }, [isVideoOff])

  // ── Start Screen Share ────────────────────────────────────────────────────
  const startScreenShare = useCallback(async (sourceId = null) => {
    try {
      let stream

      if (window.fikraElectron && sourceId) {
        // Electron: use desktopCapturer source
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 1920,
              maxHeight: 1080,
            },
          },
        })
      } else {
        // Browser: standard screen capture
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false,
        })
      }

      screenStreamRef.current = stream
      setIsSharingScreen(true)

      // Auto-stop when user cancels via browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopScreenShare()
      })

      return stream
    } catch (err) {
      console.error('[Media] Screen share error:', err)
      return null
    }
  }, [])

  // ── Stop Screen Share ─────────────────────────────────────────────────────
  const stopScreenShare = useCallback(() => {
    const stream = screenStreamRef.current
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
    }
    setIsSharingScreen(false)
  }, [])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  return {
    localStream,
    localStreamRef,
    screenStreamRef,
    isMuted,
    isVideoOff,
    isSharingScreen,
    hasMedia,
    mediaError,
    initMedia,
    toggleMute,
    forceMute,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
  }
}
