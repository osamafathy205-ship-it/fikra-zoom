/**
 * useLiveKit — Fikra Academy
 * Manages the full LiveKit Room lifecycle:
 * connect, local tracks (camera / mic / screen), remote track subscriptions.
 * All custom WebRTC signaling (offers, answers, ICE candidates) is handled
 * transparently by the LiveKit SDK — zero glare, zero race conditions.
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import {
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'

export function useLiveKit() {
  const roomRef  = useRef(null)

  const [lkConnected,       setLkConnected]       = useState(false)
  const [localVideoTrack,   setLocalVideoTrack]   = useState(null)
  const [localAudioTrack,   setLocalAudioTrack]   = useState(null)
  const [localScreenTrack,  setLocalScreenTrack]  = useState(null)
  const [isVideoEnabled,    setIsVideoEnabled]     = useState(false)
  const [isAudioEnabled,    setIsAudioEnabled]     = useState(false)
  const [isSharingScreen,   setIsSharingScreen]   = useState(false)
  // Map<identity (= socketId), { video, audio, screen } LiveKit Track objects>
  const [remoteTracks,      setRemoteTracks]      = useState(new Map())

  // ─── Rebuild the remoteTracks map from current room state ─────────────────
  const syncRemoteTracks = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    const next = new Map()
    room.remoteParticipants.forEach((p) => {
      const vid    = p.getTrackPublication(Track.Source.Camera)
      const aud    = p.getTrackPublication(Track.Source.Microphone)
      const screen = p.getTrackPublication(Track.Source.ScreenShare)
      next.set(p.identity, {
        video:  vid?.isSubscribed  && vid?.track  || null,
        audio:  aud?.isSubscribed  && aud?.track  || null,
        screen: screen?.isSubscribed && screen?.track || null,
        isMuted:   !aud?.isSubscribed || aud?.isMuted  || false,
        isVideoOff: !vid?.isSubscribed || vid?.isMuted || false,
      })
    })
    setRemoteTracks(new Map(next))
  }, [])

  // ─── Connect to LiveKit room with a pre-generated token ───────────────────
  const connect = useCallback(async (url, token) => {
    if (roomRef.current) return roomRef.current   // already connected

    const room = new Room({
      adaptiveStream:    true,
      dynacast:          true,
      disconnectOnPageLeave: true,
    })
    roomRef.current = room

    // ── Remote track events ──────────────────────────────────────────────────
    room
      .on(RoomEvent.TrackSubscribed,        syncRemoteTracks)
      .on(RoomEvent.TrackUnsubscribed,      syncRemoteTracks)
      .on(RoomEvent.TrackMuted,             syncRemoteTracks)
      .on(RoomEvent.TrackUnmuted,           syncRemoteTracks)
      .on(RoomEvent.ParticipantConnected,   syncRemoteTracks)
      .on(RoomEvent.ParticipantDisconnected, syncRemoteTracks)

    // ── Local track events ───────────────────────────────────────────────────
    room.on(RoomEvent.LocalTrackPublished, (pub) => {
      const t = pub.track
      if (t.source === Track.Source.Camera)      { setLocalVideoTrack(t);  setIsVideoEnabled(true)  }
      if (t.source === Track.Source.Microphone)  { setLocalAudioTrack(t);  setIsAudioEnabled(true)  }
      if (t.source === Track.Source.ScreenShare) { setLocalScreenTrack(t); setIsSharingScreen(true) }
    })
    room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
      const src = pub.track?.source
      if (src === Track.Source.Camera)      { setLocalVideoTrack(null);  setIsVideoEnabled(false)  }
      if (src === Track.Source.Microphone)  { setLocalAudioTrack(null);  setIsAudioEnabled(false)  }
      if (src === Track.Source.ScreenShare) { setLocalScreenTrack(null); setIsSharingScreen(false) }
    })
    room.on(RoomEvent.Disconnected, () => {
      setLkConnected(false)
      setLocalVideoTrack(null)
      setLocalAudioTrack(null)
      setLocalScreenTrack(null)
      setRemoteTracks(new Map())
    })

    await room.connect(url, token)
    setLkConnected(true)
    return room
  }, [syncRemoteTracks])

  // ─── Media controls ────────────────────────────────────────────────────────
  const enableCamera  = useCallback(async () => {
    await roomRef.current?.localParticipant?.setCameraEnabled(true)
    setIsVideoEnabled(true)
  }, [])

  const disableCamera = useCallback(async () => {
    await roomRef.current?.localParticipant?.setCameraEnabled(false)
    setIsVideoEnabled(false)
  }, [])

  const toggleCamera  = useCallback(async () => {
    const newVal = !isVideoEnabled
    await roomRef.current?.localParticipant?.setCameraEnabled(newVal)
    setIsVideoEnabled(newVal)
    return newVal
  }, [isVideoEnabled])

  const enableMic   = useCallback(async () => {
    await roomRef.current?.localParticipant?.setMicrophoneEnabled(true)
    setIsAudioEnabled(true)
  }, [])

  const disableMic  = useCallback(async () => {
    await roomRef.current?.localParticipant?.setMicrophoneEnabled(false)
    setIsAudioEnabled(false)
  }, [])

  const toggleMic   = useCallback(async () => {
    const newVal = !isAudioEnabled
    await roomRef.current?.localParticipant?.setMicrophoneEnabled(newVal)
    setIsAudioEnabled(newVal)
    return newVal
  }, [isAudioEnabled])

  // Force-mute / force-video-off (used by host commands)
  const forceMute    = useCallback(async (muted) => {
    await roomRef.current?.localParticipant?.setMicrophoneEnabled(!muted)
    setIsAudioEnabled(!muted)
  }, [])
  const forceVideoOff = useCallback(async (off) => {
    await roomRef.current?.localParticipant?.setCameraEnabled(!off)
    setIsVideoEnabled(!off)
  }, [])

  const startScreenShare = useCallback(async () => {
    await roomRef.current?.localParticipant?.setScreenShareEnabled(true)
    setIsSharingScreen(true)
  }, [])

  const stopScreenShare  = useCallback(async () => {
    await roomRef.current?.localParticipant?.setScreenShareEnabled(false)
    setIsSharingScreen(false)
    setLocalScreenTrack(null)
  }, [])

  // ─── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    if (!roomRef.current) return
    await roomRef.current.disconnect()
    roomRef.current = null
    setLkConnected(false)
    setLocalVideoTrack(null)
    setLocalAudioTrack(null)
    setLocalScreenTrack(null)
    setRemoteTracks(new Map())
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => { roomRef.current?.disconnect() }
  }, [])

  return {
    lkConnected,
    localVideoTrack,
    localAudioTrack,
    localScreenTrack,
    isVideoEnabled,
    isAudioEnabled,
    isSharingScreen,
    remoteTracks,
    connect,
    disconnect,
    enableCamera,
    disableCamera,
    toggleCamera,
    enableMic,
    disableMic,
    toggleMic,
    forceMute,
    forceVideoOff,
    startScreenShare,
    stopScreenShare,
  }
}
