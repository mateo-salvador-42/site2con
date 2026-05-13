'use client'
import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { connectSocket } from '@/lib/socket-client'

const GAMES = [
  { id: 'lyrics',    label: 'Complète les paroles', emoji: '🎵', desc: 'Devine les mots manquants dans les paroles' },
  { id: 'culture-g', label: 'Culture Générale',     emoji: '🧠', desc: 'Quiz de culture générale' },
  { id: 'petit-bac', label: 'Petit Bac',            emoji: '📝', desc: 'Remplis les catégories avec la même lettre' },
  { id: 'flags',     label: 'Drapeaux',             emoji: '🌍', desc: 'Trouve le pays à partir de son drapeau' },
]

const CULTURE_G_CATEGORIES = ['Géographie', 'Histoire', 'Sciences', 'Sport', 'TV & Cinéma', 'Musique', 'Arts & Littérature', 'Jeux vidéos', 'Gastronomie', 'Culture générale', 'Actu & Politique']
const PETIT_BAC_PRESETS    = ['Prénom', 'Animal', 'Pays', 'Ville', 'Fruit/Légume', 'Métier', 'Objet', 'Film/Série', 'Marque', 'Sport', 'Célébrité', 'Personne Fictif']

type RangeSetting       = { type: 'range';       label: string; key: string; min: number; max: number; step: number; default: number; unit: string }
type ToggleSetting      = { type: 'toggle';      label: string; key: string; options: { value: string; label: string }[]; default: string }
type MultiSelectSetting = { type: 'multiselect'; label: string; key: string; options: string[]; default: string[]; allowCustom?: boolean }
type LettersSetting     = { type: 'letters';     label: string; key: string; options: string[]; default: string[] }
type GameSetting = RangeSetting | ToggleSetting | MultiSelectSetting | LettersSetting

const GAME_SETTINGS: Record<string, GameSetting[]> = {
  'lyrics': [
    { type: 'range', label: 'Nombre de questions', key: 'questionCount', min: 3, max: 10, step: 1, default: 5, unit: '' },
    { type: 'range', label: 'Durée par question',  key: 'roundDuration', min: 15, max: 40, step: 5, default: 25, unit: 's' },
  ],
  'culture-g': [
    { type: 'range',       label: 'Nombre de questions', key: 'questionCount', min: 5, max: 20, step: 1, default: 10, unit: '' },
    { type: 'range',       label: 'Durée par question',  key: 'roundDuration', min: 10, max: 30, step: 5, default: 15, unit: 's' },
    { type: 'multiselect', label: 'Catégories',          key: 'categories', options: CULTURE_G_CATEGORIES, default: CULTURE_G_CATEGORIES },
  ],
  'flags': [
    { type: 'range',  label: 'Nombre de drapeaux', key: 'roundCount',   min: 5, max: 20, step: 1,  default: 10, unit: '' },
    { type: 'range',  label: 'Temps par drapeau',  key: 'roundDuration', min: 10, max: 40, step: 5, default: 20, unit: 's' },
    { type: 'toggle', label: 'Difficulté',          key: 'difficulty',
      options: [{ value: 'facile', label: '🌍 Facile (pays connus)' }, { value: 'difficile', label: '🗺️ Difficile (tous les pays)' }],
      default: 'facile' },
  ],
  'petit-bac': [
    { type: 'range',  label: 'Nombre de manches', key: 'roundCount', min: 2, max: 10, step: 1, default: 3, unit: '' },
    { type: 'toggle', label: 'Fin de manche',     key: 'endMode',
      options: [{ value: 'timer', label: '⏱ Timer fixe' }, { value: 'stop', label: '✋ Premier STOP' }],
      default: 'timer' },
    { type: 'range',       label: 'Durée d\'écriture',  key: 'roundDuration', min: 30, max: 120, step: 15, default: 60, unit: 's' },
    { type: 'letters',     label: 'Lettres jouables',   key: 'letters', options: 'ABCDEFGHIJKLMNOPRSTVXYZ'.split(''), default: 'ABCDEFGHIJKLMNOPRSTVXYZ'.split('') },
    { type: 'multiselect', label: 'Catégories',         key: 'categories', options: PETIT_BAC_PRESETS, default: PETIT_BAC_PRESETS.slice(0, 5), allowCustom: true },
  ],
}

type SettingValue = number | string | string[]

function buildDefaultSettings(gameId: string): Record<string, SettingValue> {
  const result: Record<string, SettingValue> = {}
  for (const s of GAME_SETTINGS[gameId] || []) result[s.key] = s.default
  return result
}

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [selectedGame, setSelectedGame] = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, SettingValue>>({})
  const [customInput, setCustomInput] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [guestName, setGuestName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [joinError, setJoinError] = useState('')

  const isLoggedIn = status === 'authenticated'
  const username = isLoggedIn ? (session?.user?.name ?? '') : guestName

  useEffect(() => {
    if (selectedGame) { setSettings(buildDefaultSettings(selectedGame)); setCustomInput('') }
  }, [selectedGame])

  function handleSelectGame(id: string) {
    setSelectedGame(prev => prev === id ? null : id)
    setSettings(buildDefaultSettings(id))
    setCustomInput('')
    setError('')
  }

  function toggleMultiSelect(key: string, opt: string, current: string[]) {
    const selected = current.includes(opt)
    if (selected && current.length <= 1) return
    setSettings(prev => ({ ...prev, [key]: selected ? current.filter(c => c !== opt) : [...current, opt] }))
  }

  function addCustomCategory(key: string, current: string[]) {
    const trimmed = customInput.trim()
    if (!trimmed || current.includes(trimmed)) { setCustomInput(''); return }
    setSettings(prev => ({ ...prev, [key]: [...current, trimmed] }))
    setCustomInput('')
  }

  function removeCategory(key: string, cat: string, current: string[]) {
    if (current.length <= 1) return
    setSettings(prev => ({ ...prev, [key]: current.filter(c => c !== cat) }))
  }

  function createSession() {
    if (!selectedGame) return
    if (!username.trim()) { setError('Entre un pseudo'); return }
    setLoading(true)
    setError('')
    const socket = connectSocket()
    socket.emit('session:create', { gameType: selectedGame, username: username.trim(), settings }, (res: { ok: boolean; code?: string; error?: string }) => {
      setLoading(false)
      if (res.ok && res.code) router.push(`/game/${res.code}`)
      else setError(res.error || 'Erreur lors de la création')
    })
  }

  function joinSession() {
    if (!joinCode.trim()) { setJoinError('Entre un code'); return }
    if (!username.trim()) { setJoinError('Entre un pseudo d\'abord'); return }
    setLoading(true)
    setJoinError('')
    const socket = connectSocket()
    socket.emit('session:join', { code: joinCode.trim().toUpperCase(), username: username.trim() }, (res: { ok: boolean; error?: string }) => {
      setLoading(false)
      if (res.ok) router.push(`/game/${joinCode.trim().toUpperCase()}`)
      else setJoinError(res.error || 'Impossible de rejoindre')
    })
  }

  const endMode = (settings['endMode'] as string) ?? 'timer'

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 gap-4">
        <div className="flex items-center gap-4 shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Site2Con 🎮</h1>
          <Link href="/leaderboard" className="text-sm text-gray-400 hover:text-white transition-colors">🏆 Classement</Link>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <input
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError('') }}
                onKeyDown={e => e.key === 'Enter' && joinSession()}
                placeholder="Code..."
                maxLength={6}
                className="w-28 px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-500 font-mono text-sm tracking-widest text-center uppercase transition-colors"
              />
              <button
                onClick={joinSession}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors disabled:opacity-40 shrink-0"
              >
                Rejoindre
              </button>
            </div>
            {joinError && <span className="text-xs text-red-400 mt-1">{joinError}</span>}
          </div>

          <div className="w-px h-6 bg-white/10 shrink-0" />

          {isLoggedIn ? (
            <>
              <span className="text-sm text-gray-400 hidden sm:inline">
                Bonjour, <span className="text-white font-medium">{session?.user?.name}</span>
              </span>
              <button onClick={() => signOut()} className="text-sm text-gray-400 hover:text-white transition-colors shrink-0">
                Déconnexion
              </button>
            </>
          ) : (
            <div className="flex gap-2">
              <Link href="/login" className="text-sm px-4 py-2 rounded-lg border border-white/20 hover:bg-white/5 transition-colors">Connexion</Link>
              <Link href="/register" className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors">Inscription</Link>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          <div className="text-center pt-4">
            <h2 className="text-3xl font-bold mb-2">Joue avec tes amis !</h2>
            <p className="text-gray-400">Choisis un jeu, configure ta session et partage le code</p>
          </div>

          {!isLoggedIn && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ton pseudo</label>
              <input
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="Entre ton pseudo..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {GAMES.map(game => (
              <button
                key={game.id}
                onClick={() => handleSelectGame(game.id)}
                className={`p-4 rounded-xl border text-center transition-all ${selectedGame === game.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                <div className="text-4xl mb-3">{game.emoji}</div>
                <div className="font-semibold text-sm">{game.label}</div>
                <div className="text-xs text-gray-400 mt-1 leading-snug">{game.desc}</div>
              </button>
            ))}
          </div>

          {selectedGame && GAME_SETTINGS[selectedGame] && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
              <div className="text-sm font-medium text-gray-300">Paramètres</div>

              {GAME_SETTINGS[selectedGame].map(s => {
                if (s.key === 'roundDuration' && selectedGame === 'petit-bac' && endMode === 'stop') return null

                if (s.type === 'toggle') {
                  const val = (settings[s.key] as string) ?? s.default
                  return (
                    <div key={s.key}>
                      <div className="text-sm text-gray-400 mb-2">{s.label}</div>
                      <div className="flex rounded-xl overflow-hidden border border-white/10">
                        {s.options.map(opt => (
                          <button key={opt.value} onClick={() => setSettings(prev => ({ ...prev, [s.key]: opt.value }))}
                            className={`flex-1 py-2 text-sm font-medium transition-colors ${val === opt.value ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                }

                if (s.type === 'multiselect') {
                  const current = (settings[s.key] as string[]) ?? s.default
                  const presets = s.options
                  const custom = current.filter(c => !presets.includes(c))
                  return (
                    <div key={s.key}>
                      <div className="text-sm text-gray-400 mb-2">{s.label}</div>
                      <div className="grid grid-cols-2 gap-1.5 mb-2">
                        {presets.map(opt => {
                          const selected = current.includes(opt)
                          return (
                            <button key={opt} onClick={() => toggleMultiSelect(s.key, opt, current)}
                              disabled={selected && current.length <= 1}
                              className={`px-3 py-1.5 rounded-lg text-sm text-left transition-all disabled:opacity-40 ${selected ? 'bg-indigo-500/20 border border-indigo-500/50 text-indigo-300' : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'}`}>
                              {selected ? '✓ ' : ''}{opt}
                            </button>
                          )
                        })}
                      </div>
                      {s.allowCustom && (
                        <>
                          {custom.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {custom.map(cat => (
                                <span key={cat} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs">
                                  {cat}
                                  <button onClick={() => removeCategory(s.key, cat, current)} className="hover:text-red-400 transition-colors">×</button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input value={customInput} onChange={e => setCustomInput(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && addCustomCategory(s.key, current)}
                              placeholder="Ajouter une catégorie..."
                              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-500 text-sm transition-colors" />
                            <button onClick={() => addCustomCategory(s.key, current)}
                              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors">+</button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                }

                if (s.type === 'letters') {
                  const current = (settings[s.key] as string[]) ?? s.default
                  const roundCount = (settings['roundCount'] as number) ?? 3
                  const key = s.key
                  const opts = s.options
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">{s.label}</span>
                        <span className="text-gray-500 text-xs">{current.length} lettres</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {opts.map(letter => {
                          const selected = current.includes(letter)
                          const canDeselect = current.length > roundCount
                          const base = 'w-8 h-8 rounded-lg text-sm font-bold transition-all border'
                          const color = selected
                            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                            : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'
                          const dim = selected && !canDeselect ? ' opacity-40 cursor-not-allowed' : ''
                          return (
                            <button
                              key={letter}
                              onClick={() => {
                                if (!selected) setSettings((prev: Record<string, SettingValue>) => ({ ...prev, [key]: [...current, letter].sort() }))
                                else if (canDeselect) setSettings((prev: Record<string, SettingValue>) => ({ ...prev, [key]: current.filter((l: string) => l !== letter) }))
                              }}
                              className={base + ' ' + color + dim}
                            >
                              {letter}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                }

                if (s.type !== 'range') return null
                const val = (settings[s.key] as number) ?? s.default
                return (
                  <div key={s.key}>
                    <div className="flex justify-between text-sm mb-2">
                      <label className="text-gray-400">{s.label}</label>
                      <span className="font-mono font-bold text-indigo-400">{val}{s.unit}</span>
                    </div>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={val}
                      onChange={e => setSettings(prev => ({ ...prev, [s.key]: Number(e.target.value) }))}
                      className="w-full accent-indigo-500" />
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                      <span>{s.min}{s.unit}</span>
                      <span>{s.max}{s.unit}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={createSession}
            disabled={!selectedGame || loading}
            className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-lg transition-colors"
          >
            {loading ? 'Création...' : selectedGame ? `Créer — ${GAMES.find(g => g.id === selectedGame)?.label}` : 'Sélectionne un jeu'}
          </button>

        </div>
      </div>
    </main>
  )
}
