'use client'
import { useState } from 'react'
import { getSocket } from '@/lib/socket-client'

type Player = { socketId: string; username: string; score: number; isHost: boolean; isReady: boolean }
type SessionData = { code: string; gameType: string; status: string; players: Player[]; settings: Record<string, unknown> }

const GAME_LABELS: Record<string, string> = {
  'lyrics': '🎵 Complète les paroles',
  'culture-g': '🧠 Culture Générale',
  'petit-bac': '📝 Petit Bac',
}

export function Lobby({ session, mySocketId, isStarting }: { session: SessionData; mySocketId: string; isStarting: boolean }) {
  const [isReady, setIsReady] = useState(false)
  const [startLoading, setStartLoading] = useState(false)
  const [startError, setStartError] = useState('')
  const socket = getSocket()

  const amIHost = session.players.find(p => p.socketId === mySocketId)?.isHost ?? false

  function toggleReady() {
    socket.emit('session:ready', {}, () => setIsReady(r => !r))
  }

  function startGame() {
    setStartLoading(true)
    setStartError('')
    socket.emit('game:start', {}, (res: { ok: boolean; error?: string }) => {
      setStartLoading(false)
      if (!res.ok) setStartError(res.error || 'Erreur')
    })
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-sm text-gray-500 mb-1">{GAME_LABELS[session.gameType]}</div>
          <h1 className="text-2xl font-bold mb-2">Salle d&apos;attente</h1>
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-6 py-3">
            <span className="text-gray-400 text-sm">Code :</span>
            <span className="font-mono text-2xl font-bold tracking-widest">{session.code}</span>
            <button
              onClick={() => navigator.clipboard.writeText(session.code)}
              className="ml-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Copier
            </button>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-sm text-gray-400 mb-3">Joueurs ({session.players.length}/8)</div>
          <div className="space-y-2">
            {session.players.map((p) => (
              <div key={p.socketId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
                    {p.username[0].toUpperCase()}
                  </div>
                  <span className={`font-medium ${p.socketId === mySocketId ? 'text-indigo-300' : ''}`}>{p.username}</span>
                  {p.isHost && <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">Host</span>}
                  {p.socketId === mySocketId && <span className="text-xs text-gray-500">(toi)</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.isReady ? 'text-green-400 bg-green-400/10' : 'text-gray-500 bg-white/5'}`}>
                  {p.isReady ? '✓ Prêt' : 'En attente'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {isStarting ? (
          <div className="text-center py-4">
            <div className="text-2xl mb-2">🚀</div>
            <p className="font-semibold text-indigo-400">La partie démarre...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <button onClick={toggleReady} className={`w-full py-3 rounded-xl font-semibold transition-colors ${isReady ? 'bg-green-600 hover:bg-green-700' : 'bg-white/10 hover:bg-white/15 border border-white/10'}`}>
              {isReady ? '✓ Prêt !' : 'Je suis prêt'}
            </button>
            {amIHost && (
              <>
                {startError && <p className="text-red-400 text-sm text-center">{startError}</p>}
                <button onClick={startGame} disabled={startLoading}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors">
                  {startLoading ? 'Démarrage...' : '▶ Lancer la partie'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
