'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { connectSocket, getSocket } from '@/lib/socket-client'
import { LyricsGame } from '@/components/game/LyricsGame'
import { CultureGGame } from '@/components/game/CultureGGame'
import { PetitBacGame } from '@/components/game/PetitBacGame'
import { Lobby } from '@/components/game/Lobby'

type SessionData = {
  code: string
  gameType: string
  status: string
  players: { socketId: string; username: string; score: number; isHost: boolean; isReady: boolean }[]
  settings: Record<string, unknown>
}

type GameState = Record<string, unknown> & { phase?: string }

export default function GamePage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [mySocketId, setMySocketId] = useState<string>('')
  const [notification, setNotification] = useState<string>('')

  const notify = useCallback((msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(''), 3000)
  }, [])

  useEffect(() => {
    const socket = connectSocket()
    setMySocketId(socket.id || '')

    socket.on('connect', () => setMySocketId(socket.id || ''))
    socket.on('session:updated', setSession)
    socket.on('session:player-left', ({ username }: { username: string }) => notify(`${username} a quitté la partie`))
    socket.on('game:starting', () => setGameState({ phase: 'starting' }))
    socket.on('game:state', (state: GameState) => setGameState(state))
    socket.on('game:over', (data: GameState) => setGameState({ phase: 'over', ...data }))

    return () => {
      socket.off('session:updated')
      socket.off('session:player-left')
      socket.off('game:starting')
      socket.off('game:state')
      socket.off('game:over')
    }
  }, [notify])

  function sendAction(type: string, payload: unknown) {
    getSocket().emit('game:action', { type, payload })
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-400">Connexion à la session {code}...</p>
          <button onClick={() => router.push('/')} className="mt-4 text-sm text-gray-500 hover:text-white transition-colors">← Retour à l&apos;accueil</button>
        </div>
      </div>
    )
  }

  if (session.status === 'lobby' || !gameState || gameState.phase === 'starting') {
    return (
      <div className="min-h-screen flex flex-col">
        {notification && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm z-50 animate-fade-in">
            {notification}
          </div>
        )}
        <Lobby session={session} mySocketId={mySocketId} isStarting={gameState?.phase === 'starting'} />
      </div>
    )
  }

  const gameProps = { session, gameState, onAction: sendAction, mySocketId }

  return (
    <div className="min-h-screen flex flex-col">
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm z-50">
          {notification}
        </div>
      )}
      {session.gameType === 'lyrics' && <LyricsGame {...gameProps} />}
      {session.gameType === 'culture-g' && <CultureGGame {...gameProps} />}
      {session.gameType === 'petit-bac' && <PetitBacGame {...gameProps} />}
    </div>
  )
}
