import React, { useState } from 'react'
import { Mic, MicOff, Video, VideoOff, Crown, UserX, Hand } from 'lucide-react'
import './ParticipantList.css'

export default function ParticipantList({ participants, mySocketId, isHost, meetingId, emit, fullMode }) {
  const [confirmKick, setConfirmKick] = useState(null)

  const handleMute = (p) => {
    emit('mute-user', { meetingId, targetSocketId: p.socketId, muted: !p.isMuted })
  }

  const handleToggleVideoLock = (p) => {
    emit('lock-user-video', { meetingId, targetSocketId: p.socketId, locked: !p.isVideoLocked })
  }

  const handleKick = (p) => {
    setConfirmKick(p)
  }

  const confirmKickUser = () => {
    if (!confirmKick) return
    emit('kick-user', { meetingId, targetSocketId: confirmKick.socketId, reason: 'تم إزالتك من قِبَل المضيف' })
    setConfirmKick(null)
  }

  const students = participants.filter(p => p.role !== 'host')
  const hosts = participants.filter(p => p.role === 'host')

  const renderParticipant = (p) => {
    const isMe = p.socketId === mySocketId
    const isParticipantHost = p.role === 'host'

    return (
      <div key={p.socketId} className={`pl-item ${isMe ? 'pl-me' : ''}`}>
        {/* Avatar */}
        <div className={`pl-avatar ${isParticipantHost ? 'pl-avatar-host' : ''}`}>
          <span>{p.name?.charAt(0)?.toUpperCase() || '؟'}</span>
          {isParticipantHost && (
            <div className="pl-avatar-crown">
              <Crown size={8} />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="pl-info">
          <div className="pl-name">
            {p.name}
            {isMe && <span className="pl-you-tag">(أنت)</span>}
            {isParticipantHost && <span className="pl-host-tag">مضيف</span>}
          </div>
          <div className="pl-status" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {p.isMuted
              ? <span className="pl-status-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><MicOff size={10} /> مكتوم</span>
              : <span className="pl-status-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Mic size={10} /> نشط</span>
            }
            {p.isVideoLocked
              ? <span className="pl-status-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#ef4444' }}><VideoOff size={10} /> مقفل</span>
              : (p.isVideoOff 
                  ? <span className="pl-status-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><VideoOff size={10} /> مغلق</span>
                  : <span className="pl-status-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#22c55e' }}><Video size={10} /> مفتوح</span>
                )
            }
          </div>
        </div>

        {/* Host Controls */}
        {isHost && !isMe && !isParticipantHost && (
          <div className="pl-controls">
            <button
              className={`pl-ctrl-btn ${p.isMuted ? 'muted' : 'unmuted'}`}
              onClick={() => handleMute(p)}
              title={p.isMuted ? 'إلغاء الكتم والسماح بالكلام' : 'كتم الصوت'}
            >
              {p.isMuted ? <Mic size={13} /> : <MicOff size={13} />}
            </button>
            <button
              className={`pl-ctrl-btn ${p.isVideoLocked ? 'muted' : 'unmuted'}`}
              onClick={() => handleToggleVideoLock(p)}
              title={p.isVideoLocked ? 'السماح بتشغيل الكاميرا' : 'قفل الكاميرا'}
            >
              {p.isVideoLocked ? <Video size={13} /> : <VideoOff size={13} />}
            </button>
            <button
              className="pl-ctrl-btn kick"
              onClick={() => handleKick(p)}
              title="إزالة المشارك"
            >
              <UserX size={13} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`pl-root ${fullMode ? 'full' : ''}`}>
      {/* Header */}
      <div className="pl-header">
        <span className="pl-title">المشاركون</span>
        <span className="pl-count">{participants.length} متصل</span>
      </div>

      <div className="pl-list">
        {/* Hosts first */}
        {hosts.length > 0 && (
          <div className="pl-section">
            <div className="pl-section-label">المضيفون</div>
            {hosts.map(renderParticipant)}
          </div>
        )}

        {/* Students */}
        <div className="pl-section">
          <div className="pl-section-label">الطلاب ({students.length})</div>
          {students.length === 0 && (
            <div className="pl-empty">لا يوجد طلاب متصلون بعد</div>
          )}
          {students.map(renderParticipant)}
        </div>
      </div>

      {/* Kick Confirm Modal */}
      {confirmKick && (
        <div className="pl-confirm-overlay">
          <div className="pl-confirm-card glass-card">
            <p>إزالة <strong className="text-gold">{confirmKick.name}</strong> من المحاضرة؟</p>
            <div className="flex gap-3">
              <button className="btn btn-danger" onClick={confirmKickUser}>إزالة</button>
              <button className="btn btn-ghost" onClick={() => setConfirmKick(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
