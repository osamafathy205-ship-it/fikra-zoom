import React, { useState, useRef, useEffect } from 'react'
import { Send, X } from 'lucide-react'
import './Chat.css'

export default function Chat({ meetingId, messages, mySocketId, userName, emit, dispatch, fullMode }) {
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    const clean = text.trim()
    if (!clean) return
    emit('send-message', { meetingId, message: clean })
    setText('')
  }

  const formatTime = (ts) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  return (
    <div className={`chat-root ${fullMode ? 'full' : ''}`}>
      {/* Header */}
      <div className="chat-header">
        <span className="chat-title">المحادثة</span>
        <span className="chat-count">{messages.length} رسالة</span>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span>💬</span>
            <p>لا توجد رسائل بعد</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.socketId === mySocketId
          return (
            <div key={msg.id} className={`chat-msg ${isMe ? 'mine' : 'theirs'}`}>
              {!isMe && (
                <div className="chat-msg-name">
                  {msg.name}
                  {msg.role === 'host' && <span className="chat-host-tag">مضيف</span>}
                </div>
              )}
              <div className="chat-bubble">
                <span className="chat-text">{msg.message}</span>
              </div>
              <div className="chat-time">{formatTime(msg.timestamp)}</div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <input
          id="chat-input"
          className="chat-input"
          type="text"
          placeholder="اكتب رسالة..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          maxLength={500}
          dir="rtl"
        />
        <button
          id="btn-send-chat"
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={!text.trim()}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
