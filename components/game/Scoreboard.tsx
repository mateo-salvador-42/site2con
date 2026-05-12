'use client'

type Score = { username: string; score: number }

export function Scoreboard({ scores, title = 'Scores' }: { scores: Score[]; title?: string }) {
  const sorted = [...scores].sort((a, b) => b.score - a.score)
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="text-sm text-gray-400 mb-3">{title}</div>
      <div className="space-y-2">
        {sorted.map((s, i) => (
          <div key={s.username} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 w-5">{i + 1}.</span>
              <span className={i === 0 ? 'font-bold text-yellow-400' : 'font-medium'}>{s.username}</span>
            </div>
            <span className="font-mono font-bold text-indigo-400">{s.score} pts</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GameOver({ scores, onHome }: { scores: Score[]; onHome: () => void }) {
  const sorted = [...scores].sort((a, b) => b.score - a.score)
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="text-5xl mb-2">🏆</div>
        <h2 className="text-3xl font-bold">Partie terminée !</h2>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          {sorted.map((s, i) => (
            <div key={s.username} className={`flex items-center justify-between p-3 rounded-xl ${i === 0 ? 'bg-yellow-400/10 border border-yellow-400/20' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{medals[i] || `${i + 1}.`}</span>
                <span className={`font-semibold ${i === 0 ? 'text-yellow-400 text-lg' : ''}`}>{s.username}</span>
              </div>
              <span className="font-mono font-bold text-xl">{s.score} pts</span>
            </div>
          ))}
        </div>
        <button onClick={onHome} className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold transition-colors">
          Retour à l&apos;accueil
        </button>
      </div>
    </div>
  )
}
