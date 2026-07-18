import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { useSocket } from '../hooks/useSocket.js'
import { useMedia } from '../hooks/useMedia.js'
import Chat from '../components/Chat.jsx'
import ParticipantList from '../components/ParticipantList.jsx'
import './LectureRoom.css'
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  MessageSquare, Users, PhoneOff, Hand, Volume2,
  MoreVertical, Share2
} from 'lucide-react'

// ─── Local Video Preview ───────────────────────────────────────────────────────
function LocalVideo({ stream, name, isMuted, isVideoOff }) {
  const videoEl = useRef(null)

  useEffect(() => {
    if (videoEl.current) {
      videoEl.current.srcObject = stream || null
    }
  }, [stream])

  return (
    <div className={`video-tile local ${isVideoOff ? 'video-off' : ''}`}>
      {!isVideoOff && stream
        ? <video ref={videoEl} autoPlay muted playsInline className="video-el" />
        : (
          <div className="video-avatar">
            <span>{name?.charAt(0)?.toUpperCase() || '؟'}</span>
          </div>
        )
      }
      <div className="video-label">
        {isMuted && <MicOff size={11} className="video-muted-icon" />}
        <span>{name} (أنت)</span>
      </div>
    </div>
  )
}

// ─── Remote Video Tile ─────────────────────────────────────────────────────────
function RemoteVideo({ participant, stream }) {
  const videoEl = useRef(null)

  useEffect(() => {
    if (videoEl.current) {
      videoEl.current.srcObject = stream || null
    }
  }, [stream])

  return (
    <div className={`video-tile remote ${participant.isVideoOff || !stream ? 'video-off' : ''}`}>
      {!participant.isVideoOff && stream
        ? <video ref={videoEl} autoPlay playsInline className="video-el" />
        : (
          <div className="video-avatar">
            <span>{participant.name?.charAt(0)?.toUpperCase() || '؟'}</span>
          </div>
        )
      }
      <div className="video-label">
        {participant.isMuted && <MicOff size={11} className="video-muted-icon" />}
        <span>{participant.name}</span>
        {participant.role === 'host' && (
          <span className="video-host-badge">مضيف</span>
        )}
      </div>
    </div>
  )
}

// ─── Screen Share Presentation Viewport ──────────────────────────────────────────
function ScreenShareVideo({ isMe, localStream, remoteStream, presenterName }) {
  const videoEl = useRef(null)
  const activeStream = isMe ? localStream : remoteStream

  useEffect(() => {
    if (videoEl.current) {
      videoEl.current.srcObject = activeStream || null
    }
  }, [activeStream])

  return (
    <div className="screen-share-viewport">
      {activeStream ? (
        <video ref={videoEl} autoPlay playsInline className="screen-video-el" />
      ) : (
        <div className="screen-loading">
          <span>📺</span>
          <p>جاري تحميل مشاركة الشاشة للمحاضر ({presenterName})...</p>
        </div>
      )}
      <div className="screen-label">
        🖥️ شاشة العرض: {presenterName}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LECTURE ROOM PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function LectureRoom() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const { socketRef, connected, emit, on } = useSocket()
  const {
    localStream, localStreamRef, screenStreamRef, isMuted, isVideoOff, isSharingScreen,
    initMedia, toggleMute, toggleVideo, forceMute,
    startScreenShare, stopScreenShare
  } = useMedia()

  const [handRaised, setHandRaised] = useState(false)
  const [screenShareActive, setScreenShareActive] = useState(false)
  const [screenSharerName, setScreenSharerName] = useState(null)
  const [screenSharerId, setScreenSharerId] = useState(null)
  const [participants, setParticipants] = useState(state.participants || [])
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [screenSources, setScreenSources] = useState([])
  const [showScreenModal, setShowScreenModal] = useState(false)

  // WebRTC Mesh state
  const peersRef = useRef(new Map()) // targetSocketId -> RTCPeerConnection
  const screenSendersRef = useRef(new Map()) // targetSocketId -> RTCRtpSender (for screen tracks)
  const [remoteStreams, setRemoteStreams] = useState(new Map()) // targetSocketId -> { camera, screen }

  const isHost = state.role === 'host'

  const [mutedByHost, setMutedByHost] = useState(!isHost)
  const [videoLockedByHost, setVideoLockedByHost] = useState(!isHost)

  // Screen Wake Lock API reference
  const wakeLockRef = useRef(null)

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        console.log('[WakeLock] Screen Wake Lock is active ☀️')
      }
    } catch (err) {
      console.warn('[WakeLock] Failed to request wake lock:', err)
    }
  }

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().then(() => {
        wakeLockRef.current = null
        console.log('[WakeLock] Released screen lock 🌙')
      })
    }
  }

  // ── WebRTC Peer Connection Factory ─────────────────────────────────────────
  const cleanupPeer = useCallback((socketId) => {
    const pc = peersRef.current.get(socketId)
    if (pc) {
      try {
        pc.close()
      } catch (e) {}
      peersRef.current.delete(socketId)
    }
    screenSendersRef.current.delete(socketId)
    setRemoteStreams(prev => {
      const next = new Map(prev)
      next.delete(socketId)
      return next
    })
  }, [])

  const createPeerConnection = useCallback((targetSocketId, isInitiator) => {
    if (peersRef.current.has(targetSocketId)) {
      return peersRef.current.get(targetSocketId)
    }

    console.log(`[WebRTC] Creating PeerConnection with ${targetSocketId}, initiator: ${isInitiator}`)
    
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    })

    peersRef.current.set(targetSocketId, pc)

    // Add local media stream tracks if initialized
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emit('ice-candidate', { targetSocketId, candidate: event.candidate })
      }
    }

    // Remote stream track added
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track from ${targetSocketId}`)
      const stream = event.streams[0]
      if (!stream) return

      const hasAudio = stream.getAudioTracks().length > 0

      setRemoteStreams(prev => {
        const next = new Map(prev)
        const participantStreams = next.get(targetSocketId) || { camera: null, screen: null }

        // Heuristic: If it contains audio or is the first stream, classify as camera.
        // Otherwise, classify as screen sharing feed.
        if (hasAudio || (!hasAudio && !participantStreams.camera)) {
          participantStreams.camera = stream
        } else {
          participantStreams.screen = stream
        }

        next.set(targetSocketId, participantStreams)
        return next
      })
    }

    // Renegotiation handler (automatic triggers for new tracks)
    pc.onnegotiationneeded = async () => {
      try {
        if (isInitiator) {
          console.log(`[WebRTC] Negotiation needed for ${targetSocketId}, creating offer`)
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          emit('offer', { targetSocketId, offer, meetingId })
        }
      } catch (err) {
        console.error('[WebRTC] Negotiation offer error:', err)
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      console.log(`[WebRTC] Peer ${targetSocketId} connectionState: ${state}`)
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        cleanupPeer(targetSocketId)
      }
    }

    return pc
  }, [emit, meetingId, cleanupPeer, localStreamRef])

  // Sync newly activated local streams (camera toggles, lazy unmuting) with peers
  useEffect(() => {
    if (!localStream) return
    peersRef.current.forEach((pc) => {
      localStream.getTracks().forEach(track => {
        const senders = pc.getSenders()
        const existingSender = senders.find(s => s.track && s.track.kind === track.kind)
        if (existingSender) {
          existingSender.replaceTrack(track).catch(err => {
            console.error('[WebRTC] replaceTrack error:', err)
          })
        } else {
          pc.addTrack(track, localStream)
        }
      })
    })
  }, [localStream])

  // ── Init media & Wake Lock ──────────────────────────────────────────────────
  useEffect(() => {
    if (isHost) {
      initMedia(true, true)
    } else {
      initMedia(false, false)
    }

    requestWakeLock()

    // Re-lock screen awake on visibility changes (background -> foreground)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock()
        // Force refresh room state to fix potential background desyncs
        if (connected) {
          emit('join-room', {
            meetingId,
            name: state.userName,
            role: state.role,
          })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      releaseWakeLock()
      document.removeEventListener('visibilitychange', handleVisibility)
      // Cleanup all connections on component unmount
      // eslint-disable-next-line react-hooks/exhaustive-deps
      peersRef.current.forEach((pc, sid) => cleanupPeer(sid))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Join room via socket (once connected) ──────────────────────────────────
  useEffect(() => {
    if (!connected) return
    emit('join-room', {
      meetingId,
      name: state.userName,
      role: state.role,
    })
  }, [connected, meetingId, state.userName, state.role, emit])

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      on('room-state', (data) => {
        setParticipants(data.participants || [])
        dispatch({ type: 'ROOM_STATE', payload: data })

        const myId = socketRef.current?.id
        const me = data.participants?.find(p => p.socketId === myId)
        if (me) {
          setMutedByHost(me.isMuted)
          setVideoLockedByHost(me.isVideoLocked)
        }

        // Connect with everyone currently in the room
        data.participants.forEach(p => {
          if (p.socketId !== myId) {
            createPeerConnection(p.socketId, true)
          }
        })
      }),

      on('participant-joined', ({ participant, participants: ps }) => {
        setParticipants(ps)
        // Existing participants initiate WebRTC with the newly joined one
        if (participant && participant.socketId !== socketRef.current?.id) {
          createPeerConnection(participant.socketId, true)
        }
      }),

      on('participant-left', ({ socketId, participants: ps }) => {
        setParticipants(ps)
        cleanupPeer(socketId)
      }),

      on('participant-updated', ({ participants: ps }) => {
        setParticipants(ps)
        const me = ps.find(p => p.socketId === socketRef?.current?.id)
        if (me) {
          setMutedByHost(me.isMuted)
          setVideoLockedByHost(me.isVideoLocked)
        }
      }),

      on('all-muted', ({ participants: ps }) => {
        setParticipants(ps)
        if (!isHost) {
          forceMute(true)
          setMutedByHost(true)
          dispatch({ type: 'SET_MUTED', muted: true })
        }
      }),

      on('force-mute', ({ muted }) => {
        forceMute(muted)
        setMutedByHost(muted)
        if (muted) {
          dispatch({ type: 'SET_MUTED', muted: true })
        }
      }),

      on('force-video-lock', ({ locked }) => {
        setVideoLockedByHost(locked)
        if (locked) {
          if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0]
            if (videoTrack) videoTrack.enabled = false
          }
          alert('🔒 تم قفل الكاميرا الخاصة بك بواسطة المضيف')
        } else {
          alert('🔓 تم السماح لك بتشغيل الكاميرا من قبل المضيف')
        }
      }),

      // WebRTC Signal handlers
      on('offer', async ({ fromSocketId, offer }) => {
        try {
          console.log(`[WebRTC] Processing offer from ${fromSocketId}`)
          const pc = createPeerConnection(fromSocketId, false)
          await pc.setRemoteDescription(new RTCSessionDescription(offer))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          emit('answer', { targetSocketId: fromSocketId, answer })
        } catch (err) {
          console.error('[WebRTC] Offer processing failed:', err)
        }
      }),

      on('answer', async ({ fromSocketId, answer }) => {
        try {
          console.log(`[WebRTC] Processing answer from ${fromSocketId}`)
          const pc = peersRef.current.get(fromSocketId)
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer))
          }
        } catch (err) {
          console.error('[WebRTC] Answer processing failed:', err)
        }
      }),

      on('ice-candidate', async ({ fromSocketId, candidate }) => {
        try {
          const pc = peersRef.current.get(fromSocketId)
          if (pc && candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          }
        } catch (err) {
          console.error('[WebRTC] ICE candidate error:', err)
        }
      }),

      // Background message sync (stays active even when Chat panel is closed)
      on('new-message', (msg) => {
        dispatch({ type: 'NEW_MESSAGE', message: msg })
      }),

      on('kicked', ({ reason }) => {
        alert(reason || 'تم إزالتك من المحاضرة')
        navigate('/')
      }),

      on('host-left', () => {
        alert('انتهت المحاضرة — غادر المضيف')
        navigate('/')
      }),

      on('lecture-ended', () => navigate('/')),

      on('screen-share-started', ({ socketId }) => {
        const p = participants.find(p => p.socketId === socketId)
        setScreenSharerName(p?.name || 'المحاضر')
        setScreenSharerId(socketId)
        setScreenShareActive(true)
      }),

      on('screen-share-ended', () => {
        setScreenShareActive(false)
        setScreenSharerName(null)
        setScreenSharerId(null)
      }),

      on('hand-raised', ({ name, raised }) => {
        if (raised) console.log(`${name} رفع يده ✋`)
      }),
    ]
    return () => cleanups.forEach(fn => fn?.())
  }, [on, dispatch, navigate, forceMute, participants, isHost, localStreamRef, cleanupPeer, createPeerConnection, socketRef])

  // Helper to handle screen share track endings (e.g. browser bar "stop sharing" click)
  const handleStopScreenShareFromTrack = useCallback(() => {
    peersRef.current.forEach((pc, targetSocketId) => {
      const sender = screenSendersRef.current.get(targetSocketId)
      if (sender) {
        try {
          pc.removeTrack(sender)
        } catch (e) {}
        screenSendersRef.current.delete(targetSocketId)
      }
    })
    emit('screen-share-ended', { meetingId })
    setScreenShareActive(false)
    setScreenSharerName(null)
    setScreenSharerId(null)
  }, [emit, meetingId])

  // ── Controls ────────────────────────────────────────────────────────────────
  const handleToggleMute = async () => {
    if (!isHost && mutedByHost) {
      alert('🔇 تم كتم صوتك من قبل المضيف. يرجى الانتظار حتى يسمح لك بالتحدث.')
      return
    }
    
    if (!localStream) {
      const stream = await initMedia(false, true)
      if (stream) {
        emit('toggle-mute', { meetingId, isMuted: false })
        dispatch({ type: 'SET_MUTED', muted: false })
      }
    } else {
      const newMuted = toggleMute()
      emit('toggle-mute', { meetingId, isMuted: newMuted })
      dispatch({ type: 'SET_MUTED', muted: newMuted })
    }
  }

  const handleToggleVideo = async () => {
    if (!isHost && videoLockedByHost) {
      alert('📷 الكاميرا مغلقة من قبل المضيف. يرجى الانتظار حتى يسمح لك بتشغيلها.')
      return
    }

    if (!localStream) {
      const stream = await initMedia(true, isMuted)
      if (stream) {
        emit('toggle-video', { meetingId, isVideoOff: false })
      }
    } else {
      const newOff = toggleVideo()
      emit('toggle-video', { meetingId, isVideoOff: newOff })
    }
  }

  const selectScreenSource = async (sourceId) => {
    setShowScreenModal(false)
    const stream = await startScreenShare(sourceId)
    if (stream) {
      const screenTrack = stream.getVideoTracks()[0]
      peersRef.current.forEach((pc, targetSocketId) => {
        const sender = pc.addTrack(screenTrack, stream)
        screenSendersRef.current.set(targetSocketId, sender)
      })

      screenTrack.addEventListener('ended', () => {
        handleStopScreenShareFromTrack()
      })

      emit('screen-share-started', { meetingId })
      setScreenSharerName(state.userName)
      setScreenSharerId(state.mySocketId)
      setScreenShareActive(true)
    }
  }

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      stopScreenShare()
      handleStopScreenShareFromTrack()
    } else {
      if (window.fikraElectron) {
        try {
          const sources = await window.fikraElectron.screen.getSources()
          setScreenSources(sources)
          setShowScreenModal(true)
        } catch (err) {
          console.error('[ScreenShare] Failed to fetch sources:', err)
        }
      } else {
        const stream = await startScreenShare()
        if (stream) {
          const screenTrack = stream.getVideoTracks()[0]
          peersRef.current.forEach((pc, targetSocketId) => {
            const sender = pc.addTrack(screenTrack, stream)
            screenSendersRef.current.set(targetSocketId, sender)
          })

          screenTrack.addEventListener('ended', () => {
            handleStopScreenShareFromTrack()
          })

          emit('screen-share-started', { meetingId })
          setScreenSharerName(state.userName)
          setScreenSharerId(state.mySocketId)
          setScreenShareActive(true)
        }
      }
    }
  }

  const handleRaiseHand = () => {
    const newRaised = !handRaised
    setHandRaised(newRaised)
    emit('raise-hand', { meetingId, raised: newRaised })
  }

  const handleLeave = () => {
    if (isHost) {
      setShowEndConfirm(true)
    } else {
      navigate('/')
    }
  }

  const handleEndLecture = () => {
    emit('end-lecture', { meetingId })
    navigate('/')
  }

  const myInfo = participants.find(p => p.socketId === state.mySocketId) || {}

  return (
    <div className="lr-root">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="lr-header">
        <div className="lr-header-brand">
          <img src="/logo.png" alt="" className="lr-header-logo" />
          <div>
            <span className="lr-header-title">Fikra Academy</span>
            <div className="lr-header-sub">
              <div className="lr-live-badge">🔴 مباشر</div>
              <span className="lr-meeting-id">{meetingId}</span>
            </div>
          </div>
        </div>

        <div className="lr-header-stats">
          <div className="lr-stat">
            <Users size={14} />
            <span>{participants.length} مشارك</span>
          </div>
        </div>

        <div className="lr-header-actions">
          <button
            className="btn btn-ghost lr-panel-btn"
            onClick={() => dispatch({ type: 'SET_PANEL', panel: 'chat' })}
            id="btn-toggle-chat"
          >
            <MessageSquare size={16} />
            <span>محادثة</span>
            {state.unreadCount > 0 && (
              <span className="lr-badge">{state.unreadCount}</span>
            )}
          </button>
          <button
            className="btn btn-ghost lr-panel-btn"
            onClick={() => dispatch({ type: 'SET_PANEL', panel: 'participants' })}
            id="btn-toggle-participants"
          >
            <Users size={16} />
            <span>المشاركون</span>
          </button>
        </div>
      </header>

      {/* ── Main Area ─────────────────────────────────────────────── */}
      <div className="lr-main">
        {/* Screen Share Viewport */}
        {screenShareActive && (
          <div className="lr-screen-viewport">
            <ScreenShareVideo
              isMe={screenSharerId === state.mySocketId}
              localStream={screenStreamRef.current}
              remoteStream={remoteStreams.get(screenSharerId)?.screen}
              presenterName={screenSharerName}
            />
          </div>
        )}

        {/* Video Grid */}
        <div className={`lr-grid-wrap ${state.activePanel ? 'panel-open' : ''} ${screenShareActive ? 'with-screen' : ''}`}>
          <div className={`lr-video-grid ${screenShareActive ? 'lr-grid-strip' : `lr-grid-${Math.min(participants.length, 6)}`}`}>
            <LocalVideo
              stream={localStream}
              name={state.userName}
              isMuted={isMuted}
              isVideoOff={isVideoOff}
            />
            {participants
              .filter(p => p.socketId !== state.mySocketId)
              .map(p => (
                <RemoteVideo
                  key={p.socketId}
                  participant={p}
                  stream={remoteStreams.get(p.socketId)?.camera}
                />
              ))
            }
          </div>
        </div>

        {/* Side Panel */}
        {state.activePanel === 'chat' && (
          <div className="lr-side-panel">
            <Chat
              meetingId={meetingId}
              messages={state.chatMessages}
              mySocketId={state.mySocketId}
              userName={state.userName}
              emit={emit}
              dispatch={dispatch}
            />
          </div>
        )}
        {state.activePanel === 'participants' && (
          <div className="lr-side-panel">
            <ParticipantList
              participants={participants}
              mySocketId={state.mySocketId}
              isHost={isHost}
              meetingId={meetingId}
              emit={emit}
            />
          </div>
        )}
      </div>

      {/* ── Control Bar ───────────────────────────────────────────── */}
      <div className="lr-controls">
        {/* Mute */}
        <button
          id="btn-toggle-mute"
          className={`ctrl-btn ${isMuted ? 'ctrl-btn-danger' : 'ctrl-btn-default'}`}
          onClick={handleToggleMute}
          title={isMuted ? 'تشغيل الميكروفون' : 'كتم الميكروفون'}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          <span>{isMuted ? 'كتم' : 'ميكروفون'}</span>
        </button>

        {/* Video */}
        <button
          id="btn-toggle-video"
          className={`ctrl-btn ${isVideoOff ? 'ctrl-btn-danger' : 'ctrl-btn-default'}`}
          onClick={handleToggleVideo}
          title={isVideoOff ? 'تشغيل الكاميرا' : 'إيقاف الكاميرا'}
        >
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
          <span>{isVideoOff ? 'كاميرا' : 'كاميرا'}</span>
        </button>

        {/* Screen Share */}
        <button
          id="btn-screen-share"
          className={`ctrl-btn ${isSharingScreen ? 'ctrl-btn-active' : 'ctrl-btn-default'}`}
          onClick={handleScreenShare}
          title="مشاركة الشاشة"
        >
          {isSharingScreen ? <MonitorOff size={20} /> : <Monitor size={20} />}
          <span>شاشة</span>
        </button>

        {/* Raise hand (students only) */}
        {!isHost && (
          <button
            id="btn-raise-hand"
            className={`ctrl-btn ${handRaised ? 'ctrl-btn-active' : 'ctrl-btn-default'}`}
            onClick={handleRaiseHand}
            title="رفع يد"
          >
            <Hand size={20} />
            <span>{handRaised ? 'إنزال اليد' : 'رفع يد'}</span>
          </button>
        )}

        {/* Host: mute all */}
        {isHost && (
          <button
            id="btn-mute-all"
            className="ctrl-btn ctrl-btn-default"
            onClick={() => emit('mute-all', { meetingId })}
            title="كتم الجميع"
          >
            <Volume2 size={20} />
            <span>كتم الكل</span>
          </button>
        )}

        {/* Leave / End */}
        <button
          id="btn-leave"
          className="ctrl-btn ctrl-btn-leave"
          onClick={handleLeave}
          title={isHost ? 'إنهاء المحاضرة' : 'مغادرة'}
        >
          <PhoneOff size={20} />
          <span>{isHost ? 'إنهاء' : 'خروج'}</span>
        </button>
      </div>

      {/* ── End Lecture Confirm ────────────────────────────────────── */}
      {showEndConfirm && (
        <div className="lr-overlay">
          <div className="lr-confirm-card glass-card">
            <h3>إنهاء المحاضرة؟</h3>
            <p className="text-muted">سيتم إخراج جميع المشاركين من الغرفة</p>
            <div className="flex gap-3">
              <button className="btn btn-danger" onClick={handleEndLecture}>
                نعم، إنهاء
              </button>
              <button className="btn btn-ghost" onClick={() => setShowEndConfirm(false)}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Screen Source Picker (Electron) ──────────────────────── */}
      {showScreenModal && (
        <div className="lr-overlay">
          <div className="lr-confirm-card glass-card" style={{ maxWidth: '600px', width: '90%' }}>
            <h3 style={{ marginBottom: '16px' }}>اختر شاشة للمشاركة</h3>
            <div className="screen-sources-grid">
              {screenSources.map(src => (
                <button
                  key={src.id}
                  className="screen-source-btn"
                  onClick={() => selectScreenSource(src.id)}
                >
                  <img src={src.thumbnail} alt={src.name} className="screen-source-thumb" />
                  <span className="screen-source-name">{src.name}</span>
                </button>
              ))}
            </div>
            <button
              className="btn btn-ghost"
              style={{ marginTop: '16px' }}
              onClick={() => setShowScreenModal(false)}
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
