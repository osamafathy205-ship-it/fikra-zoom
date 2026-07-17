import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import TitleBar from './components/TitleBar.jsx'
import JoinPage from './pages/JoinPage.jsx'
import WaitingRoom from './pages/WaitingRoom.jsx'
import LectureRoom from './pages/LectureRoom.jsx'
import HostDashboard from './pages/HostDashboard.jsx'
import Splash from './pages/Splash.jsx'

// ─── App Context ──────────────────────────────────────────────────────────────
const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

// ─── Initial State ────────────────────────────────────────────────────────────
const initialState = {
  // User identity
  userName: localStorage.getItem('fikra_name') || '',
  role: 'student',   // 'student' | 'host'

  // Room state
  meetingId: null,
  isInRoom: false,
  isLive: false,     // Lecture has started

  // Participants
  participants: [],
  mySocketId: null,

  // Media state
  isMuted: false,
  isVideoOff: false,
  isSharingScreen: false,

  // UI state
  activePanel: null,  // 'chat' | 'participants' | 'admin'
  chatMessages: [],
  unreadCount: 0,

  // Connection
  connected: false,
  connectionError: null,
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function appReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, ...action.payload }
    case 'SET_MEETING':
      return { ...state, meetingId: action.meetingId, isInRoom: true }
    case 'ROOM_STATE':
      return {
        ...state,
        participants: action.payload.participants,
        isLive: action.payload.isLive,
        chatMessages: action.payload.chat || [],
        mySocketId: action.payload.myInfo?.socketId,
      }
    case 'LECTURE_STARTED':
      return { ...state, isLive: true }
    case 'LECTURE_ENDED':
      return { ...state, isLive: false }
    case 'UPDATE_PARTICIPANTS':
      return { ...state, participants: action.participants }
    case 'NEW_MESSAGE':
      return {
        ...state,
        chatMessages: [...state.chatMessages, action.message],
        unreadCount: state.activePanel !== 'chat' ? state.unreadCount + 1 : 0,
      }
    case 'TOGGLE_MUTE':
      return { ...state, isMuted: !state.isMuted }
    case 'SET_MUTED':
      return { ...state, isMuted: action.muted }
    case 'TOGGLE_VIDEO':
      return { ...state, isVideoOff: !state.isVideoOff }
    case 'TOGGLE_SCREEN':
      return { ...state, isSharingScreen: !state.isSharingScreen }
    case 'SET_PANEL':
      return {
        ...state,
        activePanel: state.activePanel === action.panel ? null : action.panel,
        unreadCount: action.panel === 'chat' ? 0 : state.unreadCount,
      }
    case 'SET_CONNECTED':
      return { ...state, connected: action.connected, connectionError: null }
    case 'SET_ERROR':
      return { ...state, connectionError: action.error }
    case 'LEAVE_ROOM':
      return {
        ...initialState,
        userName: state.userName,
      }
    default:
      return state
  }
}

// ─── Deep Link Router (inside router context) ─────────────────────────────────
function DeepLinkHandler({ dispatch }) {
  const navigate = useNavigate()

  useEffect(() => {
    // Check if running in Electron
    if (!window.fikraElectron) return

    const cleanup = window.fikraElectron.protocol.onDeepLink((payload) => {
      console.log('[DeepLink] Received:', payload)
      const { meetingId, role, name } = payload

      if (name) {
        dispatch({ type: 'SET_USER', payload: { userName: name, role: role || 'student' } })
        localStorage.setItem('fikra_name', name)
      }

      if (meetingId) {
        dispatch({ type: 'SET_MEETING', meetingId })
        dispatch({ type: 'SET_USER', payload: { role: role || 'student' } })

        if (role === 'host') {
          navigate(`/host/${meetingId}`)
        } else {
          navigate(`/waiting/${meetingId}`)
        }
      }
    })

    return cleanup
  }, [dispatch, navigate])

  return null
}

// ─── App Shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const [state, dispatch] = useReducer(appReducer, initialState)

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <HashRouter>
        <DeepLinkHandler dispatch={dispatch} />
        <div className="app-shell">
          <TitleBar />
          <div className="app-content">
            <Routes>
              <Route path="/" element={<Splash />} />
              <Route path="/join" element={<JoinPage />} />
              <Route path="/waiting/:meetingId" element={<WaitingRoom />} />
              <Route path="/lecture/:meetingId" element={<LectureRoom />} />
              <Route path="/host/:meetingId" element={<HostDashboard />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </HashRouter>
    </AppContext.Provider>
  )
}

export default AppShell
