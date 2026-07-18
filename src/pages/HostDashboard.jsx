import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { useSocket } from '../hooks/useSocket.js'
import { getInviteUrl } from '../config.js'
import Chat from '../components/Chat.jsx'
import ParticipantList from '../components/ParticipantList.jsx'
import './HostDashboard.css'
import {
  Play, Square, Users, MessageSquare, Settings,
  Copy, Share2, Mic, MicOff, Monitor, PhoneOff,
  CheckCircle, Clock, Wifi, WifiOff, Crown
} from 'lucide-react'

// ─── Stats Card ───────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <div className="hd-stat-card glass-card">
      <div className="hd-stat-icon" style={{ color }}>{icon}</div>
      <div>
        <div className="hd-stat-value">{value}</div>
        <div className="hd-stat-label">{label}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HOST DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function HostDashboard() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const { connected, emit, on } = useSocket()

  const [isLive, setIsLive] = useState(false)
  const [participants, setParticipants] = useState([])
  const [messages, setMessages] = useState([])
  const [activeTab, setActiveTab] = useState('participants')
  const [copied, setCopied] = useState(false)
  const [startedAt, setStartedAt] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  // Cloud-based invite URL (works from anywhere in the world)
  const studentUrl = getInviteUrl(meetingId)

  // ── Join as host via socket ────────────────────────────────────────────────
  useEffect(() => {
    if (!connected) return
    emit('join-room', {
      meetingId,
      name: state.userName || 'المضيف',
      role: 'host',
    })
  }, [connected, meetingId, state.userName, emit])

  // ── Duration timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLive || !startedAt) return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isLive, startedAt])

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const cleanups = [
      on('room-state', (data) => {
        setParticipants(data.participants || [])
        setMessages(data.chat || [])
        dispatch({ type: 'ROOM_STATE', payload: data })
        if (data.isLive) setIsLive(true)
      }),
      on('participant-joined', ({ participants: ps }) => setParticipants(ps)),
      on('participant-left', ({ participants: ps }) => setParticipants(ps)),
      on('participant-updated', ({ participants: ps }) => setParticipants(ps)),
      on('all-muted', ({ participants: ps }) => setParticipants(ps)),
      on('lecture-started', (data) => {
        setIsLive(true)
        setStartedAt(data.startedAt || Date.now())
      }),
      on('lecture-ended', () => {
        setIsLive(false)
        setElapsed(0)
        setStartedAt(null)
      }),
      on('new-message', (msg) => setMessages(prev => [...prev, msg])),
    ]
    return () => cleanups.forEach(fn => fn?.())
  }, [on, dispatch])

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleStartLecture = () => {
    emit('start-lecture', { meetingId })
    setIsLive(true)
    setStartedAt(Date.now())

    if (window.fikraElectron) {
      window.fikraElectron.notify('Fikra Academy', `بدأت المحاضرة ${meetingId} 🚀`)
    }
  }

  const handleEndLecture = () => {
    if (window.confirm('إنهاء المحاضرة وإخراج جميع المشاركين؟')) {
      emit('end-lecture', { meetingId })
      navigate('/')
    }
  }

  const handleMuteAll = () => {
    emit('mute-all', { meetingId })
  }

  const handleCopyLink = (url) => {
    if (window.fikraElectron?.clipboard?.writeText) {
      window.fikraElectron.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(err => {
        console.error('Clipboard copy failed:', err)
      })
    }
  }

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return h > 0
      ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }

  const studentCount = participants.filter(p => p.role !== 'host').length

  return (
    <div className="hd-root">
      {/* ── Left Sidebar ──────────────────────────────────────────── */}
      <aside className="hd-sidebar">
        {/* Logo + Header */}
        <div className="hd-sidebar-header">
          <img src="/logo.png" alt="Fikra Academy" className="hd-logo" />
          <div>
            <h2 className="hd-brand">Fikra Academy</h2>
            <div className="hd-host-badge">
              <Crown size={11} />
              <span>لوحة المضيف</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="hd-stats">
          <StatCard
            icon={<Users size={18} />}
            label="مشاركون"
            value={studentCount}
            color="var(--gold-500)"
          />
          <StatCard
            icon={<Clock size={18} />}
            label="المدة"
            value={isLive ? formatTime(elapsed) : '00:00'}
            color={isLive ? '#22c55e' : 'rgba(255,255,255,0.3)'}
          />
          <StatCard
            icon={connected ? <Wifi size={18} /> : <WifiOff size={18} />}
            label="الاتصال"
            value={connected ? 'متصل' : 'منقطع'}
            color={connected ? '#22c55e' : '#ef4444'}
          />
        </div>

        {/* Meeting ID + Invite */}
        <div className="hd-invite-section glass-card">
          <div className="hd-invite-label">كود المحاضرة</div>
          <div className="hd-invite-code">{meetingId}</div>

          <button
            className="btn btn-primary hd-copy-btn"
            onClick={() => handleCopyLink(studentUrl)}
            id="btn-copy-link"
            style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '10px' }}
          >
            {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
            {copied ? 'تم النسخ!' : '📋 نسخ رابط الدعوة للطلاب'}
          </button>

          <div className="hd-lan-info" style={{ marginTop: '8px' }}>
            <span className="hd-lan-label" style={{ fontSize: '10px', wordBreak: 'break-all', color: 'rgba(255,255,255,0.35)' }}>{studentUrl}</span>
          </div>
        </div>

        {/* Main Control Buttons */}
        <div className="hd-controls">
          {!isLive ? (
            <button
              id="btn-start-lecture"
              className="btn btn-primary hd-start-btn"
              onClick={handleStartLecture}
              disabled={!connected}
            >
              <Play size={18} />
              بدء المحاضرة
            </button>
          ) : (
            <div className="hd-live-indicator">
              <div className="hd-live-dot" />
              <span>المحاضرة مباشرة</span>
              <span className="hd-live-time">{formatTime(elapsed)}</span>
            </div>
          )}

          <button
            id="btn-mute-all"
            className="btn btn-ghost hd-ctrl-btn"
            onClick={handleMuteAll}
            disabled={!isLive}
            title="كتم جميع المشاركين"
          >
            <MicOff size={16} />
            كتم الجميع
          </button>

          {isLive && (
            <button
              id="btn-end-lecture"
              className="btn btn-danger hd-ctrl-btn"
              onClick={handleEndLecture}
            >
              <Square size={16} />
              إنهاء المحاضرة
            </button>
          )}

          <button
            className="btn btn-ghost hd-ctrl-btn"
            onClick={() => navigate(`/lecture/${meetingId}`)}
          >
            <Monitor size={16} />
            دخول غرفة المحاضرة
          </button>
        </div>
      </aside>

      {/* ── Main Panel ────────────────────────────────────────────── */}
      <main className="hd-main">
        {/* Tabs */}
        <div className="hd-tabs">
          {[
            { id: 'participants', label: 'المشاركون', icon: <Users size={15} />, count: studentCount },
            { id: 'chat', label: 'المحادثة', icon: <MessageSquare size={15} />, count: messages.length },
            { id: 'settings', label: 'الإعدادات', icon: <Settings size={15} /> },
          ].map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              className={`hd-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="hd-tab-count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="hd-tab-content">
          {activeTab === 'participants' && (
            <ParticipantList
              participants={participants}
              mySocketId={state.mySocketId}
              isHost={true}
              meetingId={meetingId}
              emit={emit}
              fullMode
            />
          )}

          {activeTab === 'chat' && (
            <Chat
              meetingId={meetingId}
              messages={messages}
              mySocketId={state.mySocketId}
              userName={state.userName || 'المضيف'}
              emit={emit}
              on={on}
              dispatch={dispatch}
              fullMode
            />
          )}

          {activeTab === 'settings' && (
            <div className="hd-settings">
              <h3 className="hd-settings-title">إعدادات المحاضرة</h3>

              <div className="hd-setting-item glass-card">
                <div>
                  <div className="hd-setting-label">معرّف المحاضرة</div>
                  <div className="hd-setting-value">{meetingId}</div>
                </div>
              </div>

              <div className="hd-setting-item glass-card">
                <div>
                  <div className="hd-setting-label">رابط الانضمام (بروتوكول مخصص)</div>
                  <div className="hd-setting-value hd-setting-url">{joinUrl}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => handleCopyLink(joinUrl)}>
                  <Copy size={12} /> نسخ
                </button>
              </div>

              <div className="hd-setting-item glass-card">
                <div>
                  <div className="hd-setting-label">رابط الويب</div>
                  <div className="hd-setting-value hd-setting-url">{webUrl}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => handleCopyLink(webUrl)}>
                  <Copy size={12} /> نسخ
                </button>
              </div>

              <div className="hd-setting-info">
                <p className="text-muted" style={{fontSize: '12px', lineHeight: 1.6}}>
                  💡 أرسل رابط <strong className="text-gold">fikra://join/{meetingId}</strong> للطلاب.
                  عند النقر عليه، سيفتح التطبيق تلقائياً وينقلهم لغرفة الانتظار دون أي خطوة إضافية.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Live Status Banner ────────────────────────────────────── */}
      {isLive && (
        <div className="hd-live-banner">
          <div className="hd-live-banner-dot" />
          <span>المحاضرة مباشرة الآن — {studentCount} طالب متصل</span>
          <span className="hd-live-banner-time">{formatTime(elapsed)}</span>
        </div>
      )}
    </div>
  )
}
