import React, { useState, useEffect } from 'react'
import { Minus, Square, X, Maximize2 } from 'lucide-react'
import './TitleBar.css'

/**
 * TitleBar - Custom frameless window title bar
 * Drag region + window controls (minimize/maximize/close)
 */
export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const isElectron = !!window.fikraElectron

  useEffect(() => {
    if (!isElectron) return
    window.fikraElectron.window.isMaximized().then(setIsMaximized)
  }, [isElectron])

  const handleMinimize = () => {
    if (isElectron) window.fikraElectron.window.minimize()
  }

  const handleMaximize = () => {
    if (isElectron) {
      window.fikraElectron.window.maximize()
      setIsMaximized(prev => !prev)
    }
  }

  const handleClose = () => {
    if (isElectron) window.fikraElectron.window.close()
  }

  return (
    <div className="titlebar titlebar-drag">
      {/* Logo + App Name */}
      <div className="titlebar-brand titlebar-no-drag">
        <div className="titlebar-logo-dot" />
        <span className="titlebar-name">Fikra Academy</span>
      </div>

      {/* Drag spacer */}
      <div className="titlebar-spacer" />

      {/* Window Controls */}
      {isElectron && (
        <div className="titlebar-controls titlebar-no-drag">
          <button
            className="titlebar-btn titlebar-btn-minimize"
            onClick={handleMinimize}
            title="تصغير"
          >
            <Minus size={12} />
          </button>
          <button
            className="titlebar-btn titlebar-btn-maximize"
            onClick={handleMaximize}
            title={isMaximized ? 'استعادة' : 'تكبير'}
          >
            {isMaximized ? <Square size={11} /> : <Maximize2 size={11} />}
          </button>
          <button
            className="titlebar-btn titlebar-btn-close"
            onClick={handleClose}
            title="إغلاق"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
