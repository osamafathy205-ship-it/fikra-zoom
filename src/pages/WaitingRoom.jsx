import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { useSocket } from '../hooks/useSocket.js'
import { Users, Wifi, WifiOff, Clock } from 'lucide-react'
import ParticlesBg from '../components/ParticlesBg.jsx'
import './WaitingRoom.css'

// ─── Animated Wave Bars ────────────────────────────────────────────────────────
function WaveBars() {
  return (
    <div className="wave-bars" aria-hidden="true">
      {[...Array(7)].map((_, i) => (
        <div
          key={i}
          className="wave-bar"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  )
}

// ─── Orbiting Ring ────────────────────────────────────────────────────────────
function OrbitRing({ radius, speed, dotColor, children }) {
  return (
    <div
      className="orbit-ring"
      style={{
        width: radius * 2,
        height: radius * 2,
        animationDuration: `${speed}s`,
      }}
    >
      <div className="orbit-dot" style={{ background: dotColor }} />
    </div>
  )
}

// ─── Countdown Timer ──────────────────────────────────────────────────────────
function LiveTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const secs = String(elapsed % 60).padStart(2, '0')
  return <span className="live-timer">{mins}:{secs}</span>
}

// ─── Participant Count Badge ───────────────────────────────────────────────────
function WaitingCount({ count }) {
  return (
    <div className="waiting-count">
      <Users size={14} />
      <span>{count} في الانتظار</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WAITING ROOM PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function WaitingRoom() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const { socketRef, connected, emit, on } = useSocket()

  const [joinedAt] = useState(Date.now())
  const [waitCount, setWaitCount] = useState(0)
  const [statusMsg, setStatusMsg] = useState('سنُعلمك فور بدء المحاضرة')
  const [isKicked, setIsKicked] = useState(false)
  const [hostLeft, setHostLeft] = useState(false)
  const nameInputRef = useRef(null)

  const userName = state.userName || localStorage.getItem('fikra_name') || ''
  const [inputName, setInputName] = useState(userName)
  const [hasJoined, setHasJoined] = useState(false)

  // ── Join the waiting room via socket ──────────────────────────────────────
  const joinRoom = useCallback(() => {
    const name = inputName.trim()
    if (!name) return

    localStorage.setItem('fikra_name', name)
    dispatch({ type: 'SET_USER', payload: { userName: name } })

    emit('join-room', {
      meetingId,
      name,
      role: 'student',
    })
    setHasJoined(true)
  }, [inputName, meetingId, emit, dispatch])

  // ── Auto-join if name already known ───────────────────────────────────────
  useEffect(() => {
    if (connected && userName && !hasJoined) {
      emit('join-room', {
        meetingId,
        name: userName,
        role: 'student',
      })
      setHasJoined(true)
    }
  }, [connected, userName, hasJoined, meetingId, emit])

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      // Room state snapshot on join
      on('room-state', (data) => {
        dispatch({ type: 'ROOM_STATE', payload: data })
        setWaitCount(data.participants?.length || 0)

        // If lecture already live when joining → go straight in
        if (data.isLive) {
          setStatusMsg('المحاضرة جارية بالفعل، جارٍ الدخول...')
          setTimeout(() => navigate(`/lecture/${meetingId}`), 1500)
        }
      }),

      // Lecture started → all waiting students enter
      on('lecture-started', (data) => {
        dispatch({ type: 'LECTURE_STARTED' })
        setStatusMsg(`تبدأ المحاضرة مع ${data.hostName}! ✨`)
        setTimeout(() => navigate(`/lecture/${meetingId}`), 1800)
      }),

      // Participant count updates
      on('participant-joined', ({ participants }) => {
        setWaitCount(participants?.length || 0)
      }),
      on('participant-left', ({ participants }) => {
        setWaitCount(participants?.length || 0)
      }),

      // Host left
      on('host-left', () => {
        setHostLeft(true)
        setStatusMsg('غادر المضيف، ستنتهي الجلسة قريباً')
      }),

      // Kicked
      on('kicked', ({ reason }) => {
        setIsKicked(true)
        setStatusMsg(reason || 'تم إزالتك من المحاضرة')
      }),
    ]

    return () => cleanups.forEach(fn => fn?.())
  }, [on, dispatch, navigate, meetingId])

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Name Entry (if no name)
  // ─────────────────────────────────────────────────────────────────────────
  if (!userName && !hasJoined) {
    return (
      <div className="wr-root">
        <ParticlesBg count={25} />
        <div className="wr-bg-gradient" />

        <div className="wr-name-card">
          <div className="wr-logo-wrap-sm">
            <img src="/logo.png" alt="Fikra Academy" className="wr-logo-img-sm" />
          </div>
          <h2 className="wr-name-title">أدخل اسمك للانضمام</h2>
          <p className="wr-name-sub">المحاضرة: <strong className="text-gold">{meetingId}</strong></p>
          <input
            ref={nameInputRef}
            className="wr-name-input"
            type="text"
            placeholder="الاسم الكامل..."
            value={inputName}
            onChange={e => setInputName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinRoom()}
            autoFocus
            maxLength={40}
          />
          <button
            className="btn btn-primary wr-name-btn"
            onClick={joinRoom}
            disabled={!inputName.trim()}
          >
            انضم للانتظار
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Kicked state
  // ─────────────────────────────────────────────────────────────────────────
  if (isKicked) {
    return (
      <div className="wr-root">
        <ParticlesBg count={10} />
        <div className="wr-bg-gradient" />
        <div className="wr-kicked-card glass-card">
          <div className="wr-kicked-icon">🚫</div>
          <h2>تم إزالتك من المحاضرة</h2>
          <p className="text-muted">{statusMsg}</p>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            العودة للرئيسية
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Main Waiting Room
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="wr-root">
      {/* Animated Background */}
      <ParticlesBg count={30} />
      <div className="wr-bg-gradient" />

      {/* Animated mesh grid */}
      <div className="wr-mesh" aria-hidden="true" />

      {/* ── Status Bar (top) ─────────────────────────────────────── */}
      <div className="wr-status-bar">
        {/* Connection indicator */}
        <div className={`wr-conn-badge ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span>{connected ? 'متصل' : 'جارٍ الاتصال...'}</span>
        </div>

        {/* Meeting ID chip */}
        <div className="wr-meeting-chip">
          <span className="wr-meeting-label">كود المحاضرة</span>
          <span className="wr-meeting-code">{meetingId}</span>
        </div>

        {/* Wait count */}
        <WaitingCount count={waitCount} />
      </div>

      {/* ── Center Piece ──────────────────────────────────────────── */}
      <main className="wr-center">

        {/* Orbiting rings */}
        <div className="wr-orbit-system" aria-hidden="true">
          <OrbitRing radius={150} speed={12} dotColor="rgba(244,200,66,0.9)" />
          <OrbitRing radius={200} speed={18} dotColor="rgba(244,200,66,0.5)" />
          <OrbitRing radius={255} speed={25} dotColor="rgba(27,36,88,0.8)" />
        </div>

        {/* Logo Container with Glow */}
        <div className="wr-logo-glow-wrap">
          <div className="wr-logo-rings" aria-hidden="true">
            <div className="wr-logo-ring wr-logo-ring-1" />
            <div className="wr-logo-ring wr-logo-ring-2" />
            <div className="wr-logo-ring wr-logo-ring-3" />
          </div>

          {/* Glassmorphism Logo Card */}
          <div className="wr-logo-glass">
            <div className="wr-logo-inner-glow" />
            <img
              src="/logo.png"
              alt="Fikra Academy Logo"
              className="wr-logo-img"
              draggable="false"
            />
          </div>

          {/* Floating sparkles */}
          <div className="wr-sparkles" aria-hidden="true">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`wr-sparkle wr-sparkle-${i + 1}`}>✦</div>
            ))}
          </div>
        </div>

        {/* Academy name */}
        <div className="wr-brand">
          <h1 className="wr-brand-title">
            <span className="wr-brand-f">F</span>ikra
            <span className="wr-brand-sep"> </span>
            <span className="wr-brand-academy">Academy</span>
          </h1>
          <div className="wr-brand-underline" />
        </div>

        {/* Welcome message */}
        <div className="wr-welcome">
          <p className="wr-welcome-greeting">
            مرحباً،{' '}
            <span className="wr-welcome-name">{state.userName}</span> 👋
          </p>
          <div className="wr-welcome-msg">
            <div className="wr-live-dot" />
            <span>ستبدأ المحاضرة قريباً</span>
          </div>
        </div>

        {/* Wave animation */}
        <WaveBars />

        {/* Status card */}
        <div className="wr-status-card glass-card">
          <div className="wr-status-row">
            <Clock size={14} className="wr-status-icon" />
            <span className="wr-status-text">{statusMsg}</span>
          </div>
          {hasJoined && (
            <div className="wr-wait-time">
              في الانتظار منذ: <LiveTimer startTime={joinedAt} />
            </div>
          )}
        </div>

        {/* Connecting indicator */}
        {!connected && (
          <div className="wr-connecting">
            <div className="spinner" />
            <span>جارٍ الاتصال بالخادم...</span>
          </div>
        )}

        {hostLeft && (
          <div className="wr-host-left-notice glass-card">
            <span>⚠️</span>
            <span>غادر المضيف الجلسة</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
              خروج
            </button>
          </div>
        )}
      </main>

      {/* ── Bottom footer ─────────────────────────────────────────── */}
      <footer className="wr-footer">
        <span className="wr-footer-text">
          © {new Date().getFullYear()} Fikra Academy — منصة التعلم التفاعلي
        </span>
        <button className="btn btn-ghost wr-leave-btn" onClick={() => navigate('/')}>
          مغادرة الانتظار
        </button>
      </footer>
    </div>
  )
}
