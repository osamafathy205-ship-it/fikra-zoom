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
      {!isVideoOff
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
function RemoteVideo({ participant }) {
  return (
    <div className={`video-tile ${participant.isVideoOff ? 'video-off' : ''}`}>
      <div className="video-avatar">
        <span>{participant.name?.charAt(0)?.toUpperCase() || '؟'}</span>
      </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// LECTURE ROOM PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function LectureRoom() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const { socketRef, connected, emit, on } = useSocket()
  const {
    localStream, localStreamRef, isMuted, isVideoOff, isSharingScreen,
    initMedia, toggleMute, toggleVideo, forceMute,
    startScreenShare, stopScreenShare
  } = useMedia()

  const [handRaised, setHandRaised] = useState(false)
  const [screenShareActive, setScreenShareActive] = useState(false)
  const [screenSharerName, setScreenSharerName] = useState(null)
  const [participants, setParticipants] = useState(state.participants || [])
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [screenSources, setScreenSources] = useState([])
  const [showScreenModal, setShowScreenModal] = useState(false)

  const isHost = state.role === 'host'

  // ── Init media on mount ────────────────────────────────────────────────────
  useEffect(() => {
    initMedia(true, true)
  }, [])

  // ── Join room via socket ────────────────────────────────────────────────────
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
      }),
      on('participant-joined', ({ participants: ps }) => setParticipants(ps)),
      on('participant-left', ({ participants: ps }) => setParticipants(ps)),
      on('participant-updated', ({ participants: ps }) => setParticipants(ps)),
      on('all-muted', ({ participants: ps }) => {
        setParticipants(ps)
        if (state.role !== 'host') forceMute(true)
      }),
      on('force-mute', ({ muted }) => forceMute(muted)),
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
        setScreenSharerName(p?.name || 'أحد المشاركين')
        setScreenShareActive(true)
      }),
      on('screen-share-ended', () => {
        setScreenShareActive(false)
        setScreenSharerName(null)
      }),
      on('hand-raised', ({ name, raised }) => {
        if (raised) console.log(`${name} رفع يده ✋`)
      }),
    ]
    return () => cleanups.forEach(fn => fn?.())
  }, [on, dispatch, navigate, forceMute, participants, state.role])

  // ── Controls ────────────────────────────────────────────────────────────────
  const handleToggleMute = () => {
    const newMuted = toggleMute()
    emit('toggle-mute', { meetingId, isMuted: newMuted })
    dispatch({ type: 'SET_MUTED', muted: newMuted })
  }

  const handleToggleVideo = () => {
    const newOff = toggleVideo()
    emit('toggle-video', { meetingId, isVideoOff: newOff })
  }

  const selectScreenSource = async (sourceId) => {
    setShowScreenModal(false)
    const stream = await startScreenShare(sourceId)
    if (stream) {
      emit('screen-share-started', { meetingId })
    }
  }

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      stopScreenShare()
      emit('screen-share-ended', { meetingId })
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
          emit('screen-share-started', { meetingId })
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
        {/* Video Grid */}
        <div className={`lr-grid-wrap ${state.activePanel ? 'panel-open' : ''}`}>
          {screenShareActive && (
            <div className="lr-screen-banner">
              📺 {screenSharerName} يشارك شاشته
            </div>
          )}
          <div className={`lr-video-grid lr-grid-${Math.min(participants.length, 6)}`}>
            <LocalVideo
              stream={localStream}
              name={state.userName}
              isMuted={isMuted}
              isVideoOff={isVideoOff}
            />
            {participants
              .filter(p => p.socketId !== state.mySocketId)
              .map(p => (
                <RemoteVideo key={p.socketId} participant={p} />
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
              on={on}
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
