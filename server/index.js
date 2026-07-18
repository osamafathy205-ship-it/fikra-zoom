/**
 * Fikra Academy - Socket.io Backend Server
 * Handles: Room management, Signaling, Host commands, Chat, Participant tracking
 */

const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const crypto = require('crypto')
const path = require('path')

const app = express()
const server = http.createServer(app)

// ─── CORS & Middleware ────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }))
app.use(express.json())
app.use(express.static(path.join(__dirname, '../dist')))

// ─── Socket.io Server ────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
})

// ─── In-Memory Room Store ────────────────────────────────────────────────────
// rooms: Map<meetingId, RoomState>
const rooms = new Map()

function getRoomState(meetingId) {
  if (!rooms.has(meetingId)) {
    rooms.set(meetingId, {
      meetingId,
      hostSocketId: null,
      isLive: false,             // Lecture started flag
      participants: new Map(),   // socketId → ParticipantInfo
      chat: [],                  // Chat history
      createdAt: Date.now(),
    })
  }
  return rooms.get(meetingId)
}

function getRoomParticipantsArray(room) {
  return Array.from(room.participants.values()).map(p => ({
    socketId: p.socketId,
    name: p.name,
    role: p.role,
    isMuted: p.isMuted,
    isVideoOff: p.isVideoOff,
    isVideoLocked: p.isVideoLocked || false,
    joinedAt: p.joinedAt,
    avatar: p.avatar,
  }))
}

// ─── HTTP API Endpoints ───────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, uptime: process.uptime() })
})

app.post('/api/create-room', (req, res) => {
  const meetingId = crypto.randomBytes(4).toString('hex').toUpperCase()
  getRoomState(meetingId)
  res.json({ meetingId, joinUrl: `fikra://join/${meetingId}` })
})

app.get('/api/room/:meetingId', (req, res) => {
  const room = rooms.get(req.params.meetingId)
  if (!room) return res.status(404).json({ error: 'Room not found' })
  res.json({
    meetingId: room.meetingId,
    isLive: room.isLive,
    participantCount: room.participants.size,
    hasHost: !!room.hostSocketId,
  })
})

// ─── Socket.io Events ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`)

  let currentRoom = null
  let currentRole = null

  // ── JOIN ROOM ──────────────────────────────────────────────────────────────
  socket.on('join-room', ({ meetingId, name, role, avatar }) => {
    const room = getRoomState(meetingId)
    currentRoom = meetingId
    currentRole = role

    // Add participant
    const participant = {
      socketId: socket.id,
      name: name || `مستخدم ${socket.id.slice(0, 4)}`,
      role: role || 'student',
      isMuted: role !== 'host',
      isVideoOff: role !== 'host',
      isVideoLocked: role !== 'host',
      joinedAt: Date.now(),
      avatar: avatar || null,
      meetingId,
    }
    room.participants.set(socket.id, participant)

    // Track host
    if (role === 'host') {
      room.hostSocketId = socket.id
    }

    socket.join(meetingId)

    // Send current room state to the joiner
    socket.emit('room-state', {
      meetingId,
      isLive: room.isLive,
      participants: getRoomParticipantsArray(room),
      chat: room.chat.slice(-50),  // Last 50 messages
      myInfo: participant,
    })

    // Notify everyone else
    socket.to(meetingId).emit('participant-joined', {
      participant,
      participants: getRoomParticipantsArray(room),
    })

    console.log(`[Room ${meetingId}] ${name} joined as ${role}. Total: ${room.participants.size}`)
  })

  // ── HOST STARTS LECTURE ────────────────────────────────────────────────────
  socket.on('start-lecture', ({ meetingId }) => {
    const room = rooms.get(meetingId)
    if (!room) return
    if (room.hostSocketId !== socket.id) {
      socket.emit('error', { message: 'غير مصرح لك بهذا الإجراء' })
      return
    }

    room.isLive = true
    console.log(`[Room ${meetingId}] Lecture STARTED by host`)

    // Broadcast to ALL in room (including host)
    io.to(meetingId).emit('lecture-started', {
      startedAt: Date.now(),
      hostName: room.participants.get(socket.id)?.name || 'المضيف',
    })
  })

  // ── HOST ENDS LECTURE ──────────────────────────────────────────────────────
  socket.on('end-lecture', ({ meetingId }) => {
    const room = rooms.get(meetingId)
    if (!room || room.hostSocketId !== socket.id) return

    room.isLive = false
    io.to(meetingId).emit('lecture-ended', { endedAt: Date.now() })
    console.log(`[Room ${meetingId}] Lecture ENDED`)
  })

  // ── MUTE USER (Host Only) ──────────────────────────────────────────────────
  socket.on('mute-user', ({ meetingId, targetSocketId, muted }) => {
    const room = rooms.get(meetingId)
    if (!room || room.hostSocketId !== socket.id) return

    const target = room.participants.get(targetSocketId)
    if (target) {
      target.isMuted = muted
    }

    // Tell the target to mute/unmute
    io.to(targetSocketId).emit('force-mute', { muted, by: 'host' })

    // Update everyone
    io.to(meetingId).emit('participant-updated', {
      socketId: targetSocketId,
      isMuted: muted,
      participants: getRoomParticipantsArray(room),
    })

    console.log(`[Room ${meetingId}] Host ${muted ? 'muted' : 'unmuted'} ${targetSocketId}`)
  })

  // ── LOCK USER VIDEO (Host Only) ──────────────────────────────────────────────
  socket.on('lock-user-video', ({ meetingId, targetSocketId, locked }) => {
    const room = rooms.get(meetingId)
    if (!room || room.hostSocketId !== socket.id) return

    const target = room.participants.get(targetSocketId)
    if (target) {
      target.isVideoLocked = locked
      if (locked) {
        target.isVideoOff = true
      }
    }

    // Tell the target to lock/unlock video
    io.to(targetSocketId).emit('force-video-lock', { locked })

    // Update everyone
    io.to(meetingId).emit('participant-updated', {
      socketId: targetSocketId,
      isVideoOff: locked ? true : undefined,
      participants: getRoomParticipantsArray(room),
    })

    console.log(`[Room ${meetingId}] Host ${locked ? 'locked' : 'unlocked'} video for ${targetSocketId}`)
  })

  // ── MUTE ALL (Host Only) ───────────────────────────────────────────────────
  socket.on('mute-all', ({ meetingId }) => {
    const room = rooms.get(meetingId)
    if (!room || room.hostSocketId !== socket.id) return

    room.participants.forEach((p, sid) => {
      if (p.role !== 'host') {
        p.isMuted = true
        io.to(sid).emit('force-mute', { muted: true, by: 'host' })
      }
    })

    io.to(meetingId).emit('all-muted', {
      participants: getRoomParticipantsArray(room),
    })
  })

  // ── KICK USER (Host Only) ──────────────────────────────────────────────────
  socket.on('kick-user', ({ meetingId, targetSocketId, reason }) => {
    const room = rooms.get(meetingId)
    if (!room || room.hostSocketId !== socket.id) return

    // Notify the kicked user
    io.to(targetSocketId).emit('kicked', {
      reason: reason || 'تم إزالتك من المحاضرة',
    })

    // Remove from room
    room.participants.delete(targetSocketId)
    const kickedSocket = io.sockets.sockets.get(targetSocketId)
    if (kickedSocket) {
      kickedSocket.leave(meetingId)
    }

    // Update everyone
    io.to(meetingId).emit('participant-left', {
      socketId: targetSocketId,
      participants: getRoomParticipantsArray(room),
      reason: 'kicked',
    })

    console.log(`[Room ${meetingId}] Host kicked ${targetSocketId}`)
  })

  // ── TOGGLE VIDEO ───────────────────────────────────────────────────────────
  socket.on('toggle-video', ({ meetingId, isVideoOff }) => {
    const room = rooms.get(meetingId)
    if (!room) return

    const participant = room.participants.get(socket.id)
    if (participant) {
      participant.isVideoOff = isVideoOff
    }

    io.to(meetingId).emit('participant-updated', {
      socketId: socket.id,
      isVideoOff,
      participants: getRoomParticipantsArray(room),
    })
  })

  // ── TOGGLE SELF MUTE ───────────────────────────────────────────────────────
  socket.on('toggle-mute', ({ meetingId, isMuted }) => {
    const room = rooms.get(meetingId)
    if (!room) return

    const participant = room.participants.get(socket.id)
    if (participant) {
      participant.isMuted = isMuted
    }

    io.to(meetingId).emit('participant-updated', {
      socketId: socket.id,
      isMuted,
      participants: getRoomParticipantsArray(room),
    })
  })

  // ── CHAT MESSAGE ───────────────────────────────────────────────────────────
  socket.on('send-message', ({ meetingId, message }) => {
    const room = rooms.get(meetingId)
    if (!room) return

    const sender = room.participants.get(socket.id)
    if (!sender) return

    // Sanitize
    const cleanMessage = String(message).trim().slice(0, 500)
    if (!cleanMessage) return

    const chatMessage = {
      id: crypto.randomUUID(),
      socketId: socket.id,
      name: sender.name,
      role: sender.role,
      message: cleanMessage,
      timestamp: Date.now(),
    }

    room.chat.push(chatMessage)
    // Keep only last 200 messages
    if (room.chat.length > 200) room.chat.shift()

    io.to(meetingId).emit('new-message', chatMessage)
  })

  // ── SCREEN SHARE ───────────────────────────────────────────────────────────
  socket.on('screen-share-started', ({ meetingId }) => {
    const room = rooms.get(meetingId)
    if (!room) return
    socket.to(meetingId).emit('screen-share-started', { socketId: socket.id })
  })

  socket.on('screen-share-ended', ({ meetingId }) => {
    socket.to(meetingId).emit('screen-share-ended', { socketId: socket.id })
  })

  // ── WebRTC SIGNALING ───────────────────────────────────────────────────────
  socket.on('offer', ({ targetSocketId, offer, meetingId }) => {
    io.to(targetSocketId).emit('offer', {
      fromSocketId: socket.id,
      offer,
      meetingId,
    })
  })

  socket.on('answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('answer', {
      fromSocketId: socket.id,
      answer,
    })
  })

  socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice-candidate', {
      fromSocketId: socket.id,
      candidate,
    })
  })

  // ── RAISE HAND ─────────────────────────────────────────────────────────────
  socket.on('raise-hand', ({ meetingId, raised }) => {
    const room = rooms.get(meetingId)
    if (!room) return
    const participant = room.participants.get(socket.id)
    io.to(meetingId).emit('hand-raised', {
      socketId: socket.id,
      name: participant?.name,
      raised,
    })
  })

  // ── DISCONNECT ─────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Disconnected: ${socket.id} (${reason})`)

    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom)
      room.participants.delete(socket.id)

      // Notify room about departure
      io.to(currentRoom).emit('participant-left', {
        socketId: socket.id,
        participants: getRoomParticipantsArray(room),
        reason: 'disconnect',
      })

      // If host left, notify room
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = null
        room.isLive = false
        io.to(currentRoom).emit('host-left', {
          message: 'غادر المضيف المحاضرة',
        })
      }

      // Clean up empty rooms after 5 minutes
      if (room.participants.size === 0) {
        setTimeout(() => {
          if (rooms.has(currentRoom) && rooms.get(currentRoom).participants.size === 0) {
            rooms.delete(currentRoom)
            console.log(`[Room ${currentRoom}] Cleaned up (empty)`)
          }
        }, 5 * 60 * 1000)
      }
    }
  })
})

// Route all other requests to React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001

server.on('error', (err) => {
  console.error('[Fikra Server] Server error:', err.message)
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Fikra Server] Port ${PORT} is already in use. Assuming server is already running.`)
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Fikra Server] Running on http://0.0.0.0:${PORT}`)
  console.log(`[Fikra Server] Socket.io ready — accepting connections from all network interfaces`)
})

module.exports = { app, server, io }
