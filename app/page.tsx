'use client'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { connectSocket } from '@/lib/socket-client'

const GAMES = [
  { id: 'lyrics', label: 'Complète les paroles', emoji: '🎵', desc: 'Devine les mots manquants dans les paroles' },
  { id: 'culture-g', label: 'Culture Générale', emoji: '🧠', desc: 'Quiz de culture générale' },
  { id: 'petit-bac', label: 'Petit Bac', emoji: '📝', desc: 'Remplis les catégories avec la même lettre' },
]

export default function HomePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [selectedGame, setSelectedGame] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [username, setUsername] = useState(session?.user?.name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')

  async function createSession() {
    if (!selectedGame) return
    if (!username.trim()) { setError('Entre un nom d\'utilisateur'); return }
    setLoading(true)
    setError('')
    const socket = connectSocket()
    socket.emit('session:create', { gameType: selectedGame, username: username.trim() }, (res: { ok: boolean; code?: string; error?: string }) => {
      setLoading(false)
      if (res.ok && res.code) {
        router.push(`/game/${res.code}`)
      } else {
        setError(res.error || 'Erreur lors de la création')
      }
    })
  }

  async function joinSession() {
    if (!joinCode.trim()) { setError('Entre un code de session'); return }
    if (!username.trim()) { setError('Entre un nom d\'utilisateur'); return }
    setLoading(true)
    setError('')
    const socket = connectSocket()
    socket.emit('session:join', { code: joinCode.trim().toUpperCase(), username: username.trim() }, (res: { ok: boolean; error?: string }) => {
      setLoading(false)
      if (res.ok) {
        router.push(`/game/${joinCode.trim().toUpperCase()}`)
      } else {
        setError(res.error || 'Impossible de rejoindre')
      }
    })
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <h1 className="text-2xl font-bold tracking-tight">Site2Con 🎮</h1>
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <span className="text-sm text-gray-400">Bonjour, <span className="text-white font-medium">{session.user?.name}</span></span>
              <button onClick={() => signOut()} className="text-sm text-gray-400 hover:text-white transition-colors">Déconnexion</button>
            </>
          ) : (
            <div className="flex gap-2">
              <Link href="/login" className="text-sm px-4 py-2 rounded-lg border border-white/20 hover:bg-white/5 transition-colors">Connexion</Link>
              <Link href="/register" className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors">Inscription</Link>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {mode === 'menu' && (
            <div className="space-y-4">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-2">Joue avec tes amis !</h2>
                <p className="text-gray-400">Crée une session ou rejoins-en une avec un code</p>
              </div>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Ton pseudo</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Entre ton pseudo..."
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <button onClick={() => setMode('create')} className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-lg transition-colors">
                Créer une partie
              </button>
              <button onClick={() => setMode('join')} className="w-full py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-semibold text-lg transition-colors">
                Rejoindre avec un code
              </button>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <button onClick={() => { setMode('menu'); setError('') }} className="text-sm text-gray-400 hover:text-white transition-colors mb-2">← Retour</button>
              <h2 className="text-2xl font-bold mb-4">Choisir un jeu</h2>
              {GAMES.map(game => (
                <button
                  key={game.id}
                  onClick={() => setSelectedGame(game.id)}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${selectedGame === game.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{game.emoji}</span>
                    <div>
                      <div className="font-semibold">{game.label}</div>
                      <div className="text-sm text-gray-400">{game.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                onClick={createSession}
                disabled={!selectedGame || loading}
                className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-lg transition-colors"
              >
                {loading ? 'Création...' : 'Créer la session'}
              </button>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <button onClick={() => { setMode('menu'); setError('') }} className="text-sm text-gray-400 hover:text-white transition-colors mb-2">← Retour</button>
              <h2 className="text-2xl font-bold mb-4">Rejoindre une partie</h2>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Code de session</label>
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Ex: AB12CD"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-500 font-mono text-xl tracking-widest text-center uppercase transition-colors"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                onClick={joinSession}
                disabled={loading}
                className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-lg transition-colors"
              >
                {loading ? 'Connexion...' : 'Rejoindre'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
