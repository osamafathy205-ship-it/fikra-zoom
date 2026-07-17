import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import { useSocket } from '../hooks/useSocket.js'
import ParticlesBg from '../components/ParticlesBg.jsx'
import './Splash.css'

export default function Splash() {
  const navigate = useNavigate()
  const { state } = useApp()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="splash-root">
      <ParticlesBg count={20} />
      <div className="splash-bg" />

      <main className={`splash-center ${loaded ? 'loaded' : ''}`}>
        {/* Logo */}
        <div className="splash-logo-wrap">
          <div className="splash-logo-glow" />
          <img src="/logo.png" alt="Fikra Academy" className="splash-logo" />
        </div>

        {/* Title */}
        <div className="splash-title-wrap">
          <h1 className="splash-title">
            <span className="splash-title-f">F</span>ikra{' '}
            <span className="splash-title-a">Academy</span>
          </h1>
          <p className="splash-subtitle">منصة التعلم التفاعلي المباشر</p>
        </div>

        {/* Actions */}
        <div className="splash-actions">
          <button
            id="btn-join-meeting"
            className="btn btn-primary splash-btn-main"
            onClick={() => navigate('/join')}
          >
            انضم لمحاضرة
          </button>
          <button
            id="btn-host-meeting"
            className="btn btn-ghost splash-btn-secondary"
            onClick={() => navigate('/join?role=host')}
          >
            ابدأ محاضرة كمضيف
          </button>
        </div>

        {/* Deep link hint */}
        <div className="splash-hint">
          <span className="splash-hint-code">fikra://join/XXXX</span>
          <span className="splash-hint-text">أو انقر على رابط محاضرتك مباشرة</span>
        </div>
      </main>

      <footer className="splash-footer">
        <span>© {new Date().getFullYear()} Fikra Academy</span>
      </footer>
    </div>
  )
}
