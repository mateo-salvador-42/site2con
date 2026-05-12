'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket-client'
import { Timer } from './Timer'
import { Scoreboard, GameOver } from './Scoreboard'

type Props = {
  session: { players: { username: string; score: number }[] }
  gameState: Record<string, unknown>
  onAction: (type: string, payload: unknown) => void
  mySocketId: string
}

type PlayerSubmission = { socketId: string; username: string; answers: Record<string, string> }

type VotePhase = {
  letter: string
  submissions: PlayerSubmission[]
  categories: string[]
  timeLeft: number
}

type RoundResult = {
  scores: { username: string; score: number }[]
  roundScores: Record<string, number>
  submissions: Record<string, Record<string, string>>
}

export function PetitBacGame({ session, gameState, onAction, mySocketId }: Props) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [votePhase, setVotePhase] = useState<VotePhase | null>(null)
  const [invalids, setInvalids] = useState<Set<string>>(new Set())
  const [voteConfirmed, setVoteConfirmed] = useState(false)
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [scores, setScores] = useState(session.players)
  const socket = getSocket()

  const categories = (gameState.categories as string[]) || []
  const endMode = (gameState.endMode as string) || 'timer'

  useEffect(() => {
    setAnswers({})
    setSubmitted(false)
    setVotePhase(null)
    setInvalids(new Set())
    setVoteConfirmed(false)
    setRoundResult(null)
  }, [gameState.round])

  useEffect(() => {
    socket.on('game:vote-phase', (data: VotePhase) => { setVotePhase(data); setRoundResult(null) })
    socket.on('game:round-end', (data: RoundResult) => { setRoundResult(data); setScores(data.scores); setVotePhase(null) })
    socket.on('game:score-update', (s: { username: string; score: number }[]) => setScores(s))
    return () => {
      socket.off('game:vote-phase')
      socket.off('game:round-end')
      socket.off('game:score-update')
    }
  }, [socket])

  if (gameState.phase === 'over') {
    const s = (gameState.scores as { username: string; score: number }[]) || scores
    return <GameOver scores={s} onHome={() => router.push('/')} />
  }

  function submitAnswers() {
    if (submitted) return
    setSubmitted(true)
    onAction('submit-answers', answers)
  }

  function toggleInvalid(socketId: string, category: string) {
    if (voteConfirmed) return
    const key = `${socketId}:${category}`
    setInvalids(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function confirmVotes() {
    if (voteConfirmed) return
    setVoteConfirmed(true)
    const invalidList = [...invalids].map(key => {
      const colonIdx = key.indexOf(':')
      return { targetSocketId: key.slice(0, colonIdx), category: key.slice(colonIdx + 1) }
    })
    onAction('finalize-votes', { invalids: invalidList })
  }

  // Phase de résultat de manche
  if (roundResult) {
    const cats = votePhase?.categories || categories
    return (
      <div className="flex-1 flex flex-col p-4 gap-4 max-w-3xl mx-auto w-full">
        <div className="text-center">
          <div className="text-sm text-gray-400 mb-1">Manche {gameState.round as number} / {gameState.totalRounds as number} — résultats</div>
          <div className="text-4xl font-black text-indigo-400">{gameState.letter as string}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 pr-3 text-gray-500 font-normal">Catégorie</th>
                {Object.keys(roundResult.submissions).map(name => (
                  <th key={name} className="text-center py-2 px-2 text-indigo-300 font-medium">{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cats.map(cat => (
                <tr key={cat} className="border-b border-white/5">
                  <td className="py-2 pr-3 text-gray-400 text-xs">{cat}</td>
                  {Object.entries(roundResult.submissions).map(([name, sub]) => {
                    const ans = sub[cat]?.trim()
                    return (
                      <td key={name} className="py-2 px-2 text-center">
                        <span className={ans ? 'text-white' : 'text-gray-600 italic'}>{ans || '—'}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-wrap gap-3 justify-center">
          {Object.entries(roundResult.roundScores).map(([name, pts]) => (
            <div key={name} className="text-center">
              <div className="text-xs text-gray-400">{name}</div>
              <div className={`font-bold ${pts > 0 ? 'text-green-400' : 'text-gray-500'}`}>+{pts}</div>
            </div>
          ))}
        </div>

        <div className="text-center text-sm text-gray-500">Prochaine manche dans quelques secondes...</div>
        <Scoreboard scores={scores} />
      </div>
    )
  }

  // Phase de vote — groupé par catégorie
  if (votePhase) {
    return (
      <div className="flex-1 flex flex-col p-4 gap-4 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Validation — lettre <span className="text-indigo-400">{votePhase.letter}</span>
          </h2>
          {!voteConfirmed && <Timer seconds={votePhase.timeLeft} />}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto">
          {votePhase.categories.map(cat => (
            <div key={cat} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-3">{cat}</div>
              <div className="space-y-2">
                {votePhase.submissions.map(player => {
                  const ans = player.answers[cat]?.trim()
                  const isMe = player.socketId === mySocketId
                  const voteKey = `${player.socketId}:${cat}`
                  const isInvalid = invalids.has(voteKey)
                  return (
                    <div key={player.socketId} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-500 shrink-0 w-20 truncate">{player.username}{isMe ? ' (moi)' : ''}</span>
                        <span className={`font-medium truncate ${!ans ? 'text-gray-600 italic' : isInvalid ? 'text-red-400 line-through' : 'text-white'}`}>
                          {ans || '(vide)'}
                        </span>
                      </div>
                      {ans && !isMe && (
                        voteConfirmed ? (
                          isInvalid ? <span className="text-xs text-red-400 shrink-0">✗</span> : <span className="text-xs text-green-600 shrink-0">✓</span>
                        ) : (
                          <button
                            onClick={() => toggleInvalid(player.socketId, cat)}
                            className={`shrink-0 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${isInvalid ? 'bg-red-500/30 text-red-400 border border-red-500/40' : 'bg-white/5 hover:bg-red-500/20 text-gray-500 hover:text-red-400'}`}
                          >
                            {isInvalid ? '✗ Invalide' : '✗'}
                          </button>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {!voteConfirmed ? (
          <button onClick={confirmVotes} className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold transition-colors">
            Valider mes votes
          </button>
        ) : (
          <div className="text-center py-3 text-green-400 font-medium">✓ Votes envoyés, en attente des autres...</div>
        )}

        <Scoreboard scores={scores} />
      </div>
    )
  }

  // Phase d'écriture
  return (
    <div className="flex-1 flex flex-col p-4 gap-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">Manche {gameState.round as number} / {gameState.totalRounds as number}</div>
        <div className="text-4xl font-black text-indigo-400 tracking-widest">{gameState.letter as string}</div>
      </div>

      {endMode === 'timer' && !submitted ? (
        <Timer seconds={gameState.timeLeft as number} onEnd={submitAnswers} />
      ) : endMode === 'stop' && !submitted ? (
        <div className="text-center text-sm text-gray-400 py-1">Remplis les catégories, puis clique sur STOP pour déclencher le chrono !</div>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto">
        {categories.map(cat => (
          <div key={cat}>
            <label className="block text-sm text-gray-400 mb-1">{cat}</label>
            <input
              value={answers[cat] || ''}
              onChange={e => {
                let val = e.target.value
                const letter = gameState.letter as string
                if (val.length > 0 && val[0].toUpperCase() !== letter) val = letter + val.slice(1)
                setAnswers(a => ({ ...a, [cat]: val }))
              }}
              disabled={submitted}
              placeholder={`${cat} commençant par ${gameState.letter as string}...`}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
            />
          </div>
        ))}
      </div>

      {!submitted ? (
        <button onClick={submitAnswers} className={`w-full py-3 rounded-xl font-semibold transition-colors ${endMode === 'stop' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
          {endMode === 'stop' ? '✋ STOP !' : 'Valider mes réponses'}
        </button>
      ) : (
        <div className="text-center py-3 text-green-400 font-medium">✓ Réponses envoyées, en attente des autres...</div>
      )}

      <Scoreboard scores={scores} />
    </div>
  )
}
