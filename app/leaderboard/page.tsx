'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

type StatEntry = {
  rank: number
  username: string
  wins: number
  gamesPlayed: number
  totalScore: number
  bestScore: number
}

const TABS = [
  { label: 'Général', value: 'total' },
  { label: 'Petit Bac', value: 'petit-bac' },
  { label: 'Culture G', value: 'culture-g' },
  { label: 'Lyrics', value: 'lyrics' },
  { label: 'Drapeaux', value: 'flags' },
]

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function LeaderboardPage() {
  const [tab, setTab] = useState('total')
  const [stats, setStats] = useState<StatEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leaderboard?gameType=${tab}`)
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false) })
  }, [tab])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="max-w-2xl mx-auto w-full p-4 flex flex-col gap-6 flex-1">

        <div className="flex items-center justify-between pt-2">
          <Link href="/" className="text-gray-500 hover:text-white text-sm transition-colors">← Accueil</Link>
          <h1 className="text-2xl font-black">Classement</h1>
          <div className="w-16" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === t.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">Chargement...</div>
        ) : stats.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-center">
            Aucune partie terminée pour ce mode de jeu.
          </div>
        ) : (
          <div className="space-y-2">
            {stats.map(s => (
              <div
                key={s.username}
                className={`flex items-center gap-4 p-4 rounded-xl border ${
                  s.rank === 1 ? 'bg-yellow-500/10 border-yellow-500/30' :
                  s.rank === 2 ? 'bg-gray-400/10 border-gray-500/20' :
                  s.rank === 3 ? 'bg-orange-700/10 border-orange-700/20' :
                  'bg-white/5 border-white/10'
                }`}
              >
                <span className="w-8 text-center font-black text-lg shrink-0">
                  {MEDAL[s.rank] ?? s.rank}
                </span>
                <span className="flex-1 font-semibold truncate">{s.username}</span>
                <div className="text-right shrink-0">
                  <div className="text-indigo-300 font-bold text-sm">
                    {s.wins} victoire{s.wins !== 1 ? 's' : ''}
                  </div>
                  <div className="text-gray-500 text-xs">
                    {s.gamesPlayed} partie{s.gamesPlayed !== 1 ? 's' : ''} · {s.totalScore} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
