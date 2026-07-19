import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { useSocket } from '../hooks/useSocket.js'
import { useLiveKit } from '../hooks/useLiveKit.js'
import Chat from '../components/Chat.jsx'
import ParticipantList from '../components/ParticipantList.jsx'
import './LectureRoom.css'
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  MessageSquare, Users, PhoneOff, Hand, Volume2,
} from 'lucide-react'

// ─── Local Video Preview ───────────────────────────────────────────────────────
function LocalVideo({ videoTrack, name, isVideoEnabled, isAudioEnabled }) {
  const videoEl = useRef(null)

  useEffect(() => {
    const el = videoEl.current
    if (!el || !videoTrack || !isVideoEnabled) return
    videoTrack.attach(el)
    return () => { try { videoTrack.detach(el) } catch (_) {} }
  }, [videoTrack, isVideoEnabled])

  return (
    <div className={`video-tile local ${!isVideoEnabled ? 'video-off' : ''}`}>
      {videoTrack && isVideoEnabled && (
        <video ref={videoEl} autoPlay muted playsInline className="video-el" />
      )}
      {(!isVideoEnabled || !videoTrack) && (
        <div className="video-avatar">
          <span>{name?.charAt(0)?.toUpperCase() || '؟'}</span>
        </div>
      )}
      <div className="video-label">
        {!isAudioEnabled && <MicOff size={11} className="video-muted-icon" />}
        <span>{name} (أنت)</span>
      </div>
    </div>
  )
}

// ─── Remote Video Tile ─────────────────────────────────────────────────────────
function RemoteVideo({ participant, videoTrack, audioTrack }) {
  const videoEl = useRef(null)
  const audioEl = useRef(null)

  useEffect(() => {
    const el = videoEl.current
    if (!el || !videoTrack) return
    videoTrack.attach(el)
    return () => { try { videoTrack.detach(el) } catch (_) {} }
  }, [videoTrack])

  useEffect(() => {
    const el = audioEl.current
    if (!el || !audioTrack) return
    audioTrack.attach(el)
    return () => { try { audioTrack.detach(el) } catch (_) {} }
  }, [audioTrack])

  const isVideoOff = !videoTrack || participant.isVideoOff
  const isMuted    = !audioTrack || participant.isMuted

  return (
    <div className={`video-tile remote ${isVideoOff ? 'video-off' : ''}`}>
      {!isVideoOff && (
        <video ref={videoEl} autoPlay playsInline className="video-el" />
      )}
      {/* Hidden audio element to play remote audio */}
      <audio ref={audioEl} autoPlay style={{ display: 'none' }} />
      {isVideoOff && (
        <div className="video-avatar">
          <span>{participant.name?.charAt(0)?.toUpperCase() || '؟'}</span>
        </div>
      )}
      <div className="video-label">
        {isMuted && <MicOff size={11} className="video-muted-icon" />}
        <span>{participant.name}</span>
        {participant.role === 'host' && (
          <span className="video-host-badge">مضيف</span>
        )}
      </div>
    </div>
  )
}

// ─── Screen Share Presentation Viewport ───────────────────────────────────────
function ScreenShareVideo({ screenTrack, presenterName }) {
  const videoEl = useRef(null)

  useEffect(() => {
    const el = videoEl.current
    if (!el || !screenTrack) return
    screenTrack.attach(el)
    return () => { try { screenTrack.detach(el) } catch (_) {} }
  }, [screenTrack])

  return (
    <div className="screen-share-viewport">
      {screenTrack ? (
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
  const navigate      = useNavigate()
  const { state, dispatch } = useApp()
  const { socketRef, connected, emit, on } = useSocket()

  // LiveKit hook
  const {
    lkConnected,
    localVideoTrack, localAudioTrack, localScreenTrack,
    isVideoEnabled, isAudioEnabled, isSharingScreen, isAudioPlaybackBlocked,
    remoteTracks,
    connect: lkConnect, disconnect: lkDisconnect,
    toggleCamera, toggleMic,
    forceMute, forceVideoOff,
    startScreenShare, stopScreenShare, startAudioPlayback,
  } = useLiveKit()

  const [handRaised,       setHandRaised]       = useState(false)
  const [screenShareActive, setScreenShareActive] = useState(false)
  const [screenSharerName,  setScreenSharerName]  = useState(null)
  const [screenSharerId,    setScreenSharerId]    = useState(null)
  const [participants,     setParticipants]      = useState(state.participants || [])
  const [showEndConfirm,   setShowEndConfirm]    = useState(false)
  const [screenSources,    setScreenSources]     = useState([])
  const [showScreenModal,  setShowScreenModal]   = useState(false)
  const [mutedByHost,      setMutedByHost]       = useState(false)
  const [videoLockedByHost, setVideoLockedByHost] = useState(false)

  const isHost = state.role === 'host'

  // Floating notifications / Toast Alerts
  const [notifications, setNotifications] = useState([])
  const showNotification = useCallback((message) => {
    const id = Date.now()
    setNotifications(prev => [...prev, { id, message }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 4500)
  }, [])

  // Hand-raise chime using Web Audio API
  const playHandRaiseChime = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const playTone = (freq, time, duration) => {
        const osc      = audioCtx.createOscillator()
        const gainNode = audioCtx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, time)
        gainNode.gain.setValueAtTime(0, time)
        gainNode.gain.linearRampToValueAtTime(0.2, time + 0.05)
        gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration)
        osc.connect(gainNode)
        gainNode.connect(audioCtx.destination)
        osc.start(time)
        osc.stop(time + duration)
      }
      const now = audioCtx.currentTime
      playTone(783.99, now, 0.3)
      playTone(1046.50, now + 0.15, 0.45)
    } catch (err) {
      console.warn('[WebAudio] Chime failed:', err)
    }
  }, [])

  // Screen Wake Lock
  const wakeLockRef = useRef(null)
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch (_) {}
  }
  const releaseWakeLock = () => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }

  // ── Init media for the host immediately on mount ───────────────────────────
  useEffect(() => {
    requestWakeLock()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      releaseWakeLock()
      document.removeEventListener('visibilitychange', handleVisibility)
      lkDisconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Request LiveKit token once socket connects ────────────────────────────
  useEffect(() => {
    if (!connected) return
    emit('request-lk-token', {
      meetingId,
      name: state.userName,
      role: state.role,
    })
  }, [connected, meetingId, state.userName, state.role, emit])

  // ── Handle LiveKit token arrival → connect to room ────────────────────────
  useEffect(() => {
    const unsub = on('lk-token', async ({ token, url }) => {
      try {
        const room = await lkConnect(url, token)
        if (room && isHost) {
          await room.localParticipant.setCameraEnabled(true)
          await room.localParticipant.setMicrophoneEnabled(true)
        }
      } catch (err) {
        console.error('[LiveKit] Connection failed:', err)
        showNotification('❌ فشل الاتصال بخادم البث. تحقق من اتصالك بالإنترنت.')
      }
    })
    return unsub
  }, [on, lkConnect, isHost, showNotification])

  // ── Join room via socket (once connected) ─────────────────────────────────
  useEffect(() => {
    if (!connected) return
    emit('join-room', {
      meetingId,
      name: state.userName,
      role: state.role,
    })
  }, [connected, meetingId, state.userName, state.role, emit])

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      on('room-state', (data) => {
        setParticipants(data.participants || [])
        dispatch({ type: 'ROOM_STATE', payload: data })
        const me = data.participants?.find(p => p.socketId === socketRef.current?.id)
        if (me) {
          setMutedByHost(me.isMuted)
          setVideoLockedByHost(me.isVideoLocked)
        }
      }),

      on('participant-joined', ({ participants: ps }) => {
        setParticipants(ps)
      }),

      on('participant-left', ({ participants: ps }) => {
        setParticipants(ps)
      }),

      on('participant-updated', ({ participants: ps }) => {
        setParticipants(ps)
        const me = ps.find(p => p.socketId === socketRef?.current?.id)
        if (me) {
          setMutedByHost(me.isMuted)
          setVideoLockedByHost(me.isVideoLocked)
          if (me.isMuted) forceMute(true)
          if (me.isVideoLocked) forceVideoOff(true)
        }
      }),

      on('force-muted', () => {
        forceMute(true)
        showNotification('🔇 تم كتم صوتك من قبل المضيف.')
      }),

      on('force-video-off', () => {
        forceVideoOff(true)
        showNotification('📷 تم إيقاف كاميراتك من قبل المضيف.')
      }),

      on('lecture-ended', () => {
        showNotification('📢 انتهت المحاضرة.')
        setTimeout(() => navigate('/'), 1500)
      }),

      on('chat-message', (msg) => {
        dispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg })
        if (state.activePanel !== 'chat') {
          dispatch({ type: 'INCREMENT_UNREAD' })
        }
      }),

      on('hand-raised', ({ name, raised }) => {
        if (raised && isHost) {
          playHandRaiseChime()
          showNotification(`✋ ${name} رفع يده`)
        }
      }),

      on('screen-share-started', ({ sharerName, sharerId }) => {
        setScreenSharerName(sharerName)
        setScreenSharerId(sharerId)
        setScreenShareActive(true)
      }),

      on('screen-share-ended', () => {
        setScreenShareActive(false)
        setScreenSharerName(null)
        setScreenSharerId(null)
      }),

      on('mute-all', () => {
        if (!isHost) {
          forceMute(true)
          showNotification('🔇 قام المضيف بكتم صوت الجميع.')
        }
      }),
    ]

    return () => cleanups.forEach(fn => fn?.())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, socketRef, isHost, navigate, dispatch])

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleToggleMute = async () => {
    if (!isHost && mutedByHost) {
      alert('🔇 تم كتم صوتك من قبل المضيف. يرجى الانتظار حتى يسمح لك بالتحدث.')
      return
    }
    const newMuted = !(await toggleMic())
    emit('toggle-mute', { meetingId, isMuted: newMuted })
  }

  const handleToggleVideo = async () => {
    if (!isHost && videoLockedByHost) {
      alert('📷 الكاميرا مغلقة من قبل المضيف.')
      return
    }
    const newOff = !(await toggleCamera())
    emit('toggle-video', { meetingId, isVideoOff: newOff })
  }

  const selectScreenSource = async (sourceId) => {
    setShowScreenModal(false)
    try {
      await startScreenShare(sourceId)
      emit('screen-share-started', { meetingId, sharerName: state.userName, sharerId: state.mySocketId })
      setScreenSharerName(state.userName)
      setScreenSharerId(state.mySocketId)
      setScreenShareActive(true)
    } catch (err) {
      console.error('[ScreenShare] Electron screen share initiation failed:', err)
    }
  }

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      await stopScreenShare()
      emit('screen-share-ended', { meetingId })
      setScreenShareActive(false)
      setScreenSharerName(null)
      setScreenSharerId(null)
    } else {
      if (window.fikraElectron) {
        try {
          const sources = await window.fikraElectron.screen.getSources()
          setScreenSources(sources)
          setShowScreenModal(true)
        } catch (err) {
          console.error('[ScreenShare] Failed to fetch sources in Electron:', err)
        }
      } else {
        try {
          await startScreenShare()
          emit('screen-share-started', { meetingId, sharerName: state.userName, sharerId: state.mySocketId })
          setScreenSharerName(state.userName)
          setScreenSharerId(state.mySocketId)
          setScreenShareActive(true)
        } catch (err) {
          console.error('[ScreenShare] Browser screen share initiation failed:', err)
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
    if (isHost) setShowEndConfirm(true)
    else navigate('/')
  }

  const handleEndLecture = () => {
    emit('end-lecture', { meetingId })
    navigate('/')
  }

  // ── Helpers to find the correct remote tracks by socket ID ────────────────
  const getRemoteTracks = (socketId) => remoteTracks.get(socketId) || {}

  // Find active screen track from any remote participant
  const activeScreenTrack = (() => {
    if (!screenShareActive || !screenSharerId) return null
    if (screenSharerId === state.mySocketId) return localScreenTrack
    return getRemoteTracks(screenSharerId)?.screen || null
  })()

  return (
    <div className="lr-root">
      {/* Autoplay Audio Block Banner Alert */}
      {isAudioPlaybackBlocked && (
        <div
          className="audio-block-banner"
          onClick={startAudioPlayback}
          style={{
            background: 'var(--gold-500)',
            color: 'var(--navy-950)',
            textAlign: 'center',
            padding: '12px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            animation: 'pulse 2s infinite',
          }}
        >
          🔊 انقر هنا لتفعيل صوت المحاضرة (متصفحك يحجب تشغيل الصوت تلقائياً)
        </div>
      )}

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

      {/* ── Toast Notifications ────────────────────────────────────── */}
      <div className="lr-notifications">
        {notifications.map(n => (
          <div key={n.id} className="lr-toast glass-card">
            <span>{n.message}</span>
          </div>
        ))}
      </div>

      {/* ── Main Area ─────────────────────────────────────────────── */}
      <div className="lr-main">
        {/* Main Center Stage: Screen Share OR Pinned Host */}
        <div className={`lr-center-stage ${screenShareActive ? 'with-screen' : ''}`}>
          {screenShareActive ? (
            <ScreenShareVideo
              screenTrack={activeScreenTrack}
              presenterName={screenSharerName}
            />
          ) : (
            // Pinned Host Viewport
            (isHost || participants.some(p => p.role === 'host')) ? (
              <div className="pinned-host-container">
                {isHost ? (
                  <LocalVideo
                    videoTrack={localVideoTrack}
                    name={state.userName}
                    isVideoEnabled={isVideoEnabled}
                    isAudioEnabled={isAudioEnabled}
                  />
                ) : (
                  participants.filter(p => p.role === 'host').map(p => {
                    const rt = getRemoteTracks(p.socketId)
                    return (
                      <RemoteVideo
                        key={p.socketId}
                        participant={p}
                        videoTrack={rt.video}
                        audioTrack={rt.audio}
                      />
                    )
                  })
                )}
              </div>
            ) : (
              // Fallback if no host joined yet
              <div className="pinned-host-container waiting">
                <div className="waiting-host-box">
                  <div className="spinner"></div>
                  <p>بانتظار بدء المحاضرة من قبل المعلم...</p>
                </div>
              </div>
            )
          )}
        </div>

        {/* Dynamic Video Strip Wrap */}
        <div className={`lr-strip-wrap ${state.activePanel ? 'panel-open' : ''} ${screenShareActive ? 'with-screen' : ''}`}>
          <div className={`lr-video-strip ${screenShareActive ? 'strip-layout' : 'grid-layout'}`}>
            {/* If screen sharing is active, host's camera feed sits in the strip */}
            {screenShareActive && (
              isHost ? (
                <LocalVideo
                  videoTrack={localVideoTrack}
                  name={state.userName}
                  isVideoEnabled={isVideoEnabled}
                  isAudioEnabled={isAudioEnabled}
                />
              ) : (
                participants.filter(p => p.role === 'host').map(p => {
                  const rt = getRemoteTracks(p.socketId)
                  return (
                    <RemoteVideo
                      key={p.socketId}
                      participant={p}
                      videoTrack={rt.video}
                      audioTrack={rt.audio}
                    />
                  )
                })
              )
            )}

            {/* Local student camera preview */}
            {!isHost && (
              <LocalVideo
                videoTrack={localVideoTrack}
                name={state.userName}
                isVideoEnabled={isVideoEnabled}
                isAudioEnabled={isAudioEnabled}
              />
            )}

            {/* Remote student camera previews */}
            {participants
              .filter(p => p.role === 'student' && p.socketId !== state.mySocketId)
              .map(p => {
                const rt = getRemoteTracks(p.socketId)
                return (
                  <RemoteVideo
                    key={p.socketId}
                    participant={p}
                    videoTrack={rt.video}
                    audioTrack={rt.audio}
                  />
                )
              })
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
          className={`ctrl-btn ${!isAudioEnabled ? 'ctrl-btn-danger' : 'ctrl-btn-default'}`}
          onClick={handleToggleMute}
          title={!isAudioEnabled ? 'تشغيل الميكروفون' : 'كتم الميكروفون'}
        >
          {!isAudioEnabled ? <MicOff size={20} /> : <Mic size={20} />}
          <span>{!isAudioEnabled ? 'كتم' : 'ميكروفون'}</span>
        </button>

        {/* Video */}
        <button
          id="btn-toggle-video"
          className={`ctrl-btn ${!isVideoEnabled ? 'ctrl-btn-danger' : 'ctrl-btn-default'}`}
          onClick={handleToggleVideo}
          title={!isVideoEnabled ? 'تشغيل الكاميرا' : 'إيقاف الكاميرا'}
        >
          {!isVideoEnabled ? <VideoOff size={20} /> : <Video size={20} />}
          <span>كاميرا</span>
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
