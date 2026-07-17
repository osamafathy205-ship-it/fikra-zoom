import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../App.jsx'
import ParticlesBg from '../components/ParticlesBg.jsx'
import './JoinPage.css'

export default function JoinPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { dispatch } = useApp()

  const defaultRole = searchParams.get('role') || 'student'
  const [meetingId, setMeetingId] = useState('')
  const [name, setName] = useState(localStorage.getItem('fikra_name') || '')
  const [role, setRole] = useState(defaultRole)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async () => {
    const cleanId = meetingId.trim().toUpperCase()
    const cleanName = name.trim()

    if (!cleanName) { setError('الرجاء إدخال اسمك'); return }
    if (!cleanId && role === 'student') { setError('الرجاء إدخال كود المحاضرة'); return }

    setError('')
    localStorage.setItem('fikra_name', cleanName)
    dispatch({ type: 'SET_USER', payload: { userName: cleanName, role } })

    if (role === 'host') {
      // Create room if no ID, else use provided
      let roomId = cleanId
      if (!roomId) {
        try {
          const res = await fetch('http://localhost:3001/api/create-room', { method: 'POST' })
          const data = await res.json()
          roomId = data.meetingId
        } catch {
          setError('تعذّر الاتصال بالخادم — تأكد من تشغيل السيرفر')
          return
        }
      }
      dispatch({ type: 'SET_MEETING', meetingId: roomId })
      navigate(`/host/${roomId}`)
    } else {
      dispatch({ type: 'SET_MEETING', meetingId: cleanId })
      navigate(`/waiting/${cleanId}`)
    }
  }

  return (
    <div className="join-root">
      <ParticlesBg count={18} />
      <div className="join-bg" />

      <div className="join-card glass-card">
        {/* Logo */}
        <div className="join-logo">
          <img src="/logo.png" alt="Fikra Academy" className="join-logo-img" />
        </div>
        <h1 className="join-title">Fikra Academy</h1>

        {/* Role Toggle */}
        <div className="join-role-toggle">
          <button
            id="role-student"
            className={`join-role-btn ${role === 'student' ? 'active' : ''}`}
            onClick={() => setRole('student')}
          >
            🎓 طالب
          </button>
          <button
            id="role-host"
            className={`join-role-btn ${role === 'host' ? 'active' : ''}`}
            onClick={() => setRole('host')}
          >
            👨‍🏫 مضيف
          </button>
        </div>

        {/* Name Input */}
        <div className="join-field">
          <label className="join-label">الاسم الكامل</label>
          <input
            id="input-name"
            className="join-input"
            type="text"
            placeholder="أدخل اسمك..."
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            autoFocus
            maxLength={40}
          />
        </div>

        {/* Meeting ID (student) or optional for host */}
        <div className="join-field">
          <label className="join-label">
            {role === 'host' ? 'كود المحاضرة (اختياري)' : 'كود المحاضرة'}
          </label>
          <input
            id="input-meeting-id"
            className="join-input join-input-code"
            type="text"
            placeholder={role === 'host' ? 'اتركه فارغاً لإنشاء محاضرة جديدة' : 'XXXX'}
            value={meetingId}
            onChange={e => setMeetingId(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            maxLength={10}
          />
        </div>

        {error && <p className="join-error">{error}</p>}

        <button
          id="btn-join-submit"
          className="btn btn-primary join-submit"
          onClick={handleJoin}
        >
          {role === 'host' ? '🚀 إنشاء / بدء المحاضرة' : '⚡ انضم الآن'}
        </button>

        <button className="btn btn-ghost join-back" onClick={() => navigate('/')}>
          ← رجوع
        </button>
      </div>
    </div>
  )
}
