import React, { useEffect, useRef } from 'react'
import './ParticlesBg.css'

/**
 * ParticlesBg - Animated floating particles background
 * Creates golden particles that rise and fade for the waiting room
 */
export default function ParticlesBg({ count = 30, color = 'gold' }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const particles = []

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div')
      particle.className = `particle particle-${color}`

      const size = Math.random() * 4 + 2
      const x = Math.random() * 100
      const duration = Math.random() * 15 + 10
      const delay = Math.random() * 10
      const opacity = Math.random() * 0.5 + 0.1

      particle.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${x}%;
        bottom: -10px;
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
        opacity: ${opacity};
      `

      container.appendChild(particle)
      particles.push(particle)
    }

    return () => {
      particles.forEach(p => p.remove())
    }
  }, [count, color])

  return <div ref={containerRef} className="particles-container" aria-hidden="true" />
}
