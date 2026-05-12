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

type VotePhase = {
  submissions: { socketId: string; username: string; answers: Record<string, string> }[]
  categories: string[]
}

export function PetitBacGame({ session, gameState, onAction, mySocketId }: Props) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [votePhase, setVotePhase] = useState<VotePhase | null>(null)
  const [votes, setVotes] = useState<Record<string, boolean>>({})
  const [scores, setScores] = useState(session.players)
  const socket = getSocket()

  const categories = (gameState.categories as string[]) || []

  useEffect(() => {
    setAnswers({})
    setSubmitted(false)
    setVotePhase(null)
    setVotes({})
  }, [gameState.round])

  useEffect(() => {
    socket.on('game:vote-phase', (data: VotePhase) => setVotePhase(data))
    socket.on('game:round-end', ({ scores: s }: { scores: { username: string; score: number }[] }) => {
      setScores(s)
      setVotePhase(null)
    })
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

  function vote(targetSocketId: string, category: string, valid: boolean) {
    const key = `${targetSocketId}:${category}`
    if (votes[key] !== undefined) return
    setVotes(v => ({ ...v, [key]: valid }))
    onAction('vote', { targetSocketId, category, valid })
  }

  if (votePhase) {
    const others = votePhase.submissions.filter(s => s.socketId !== mySocketId)
    return (
      <div className="flex-1 flex flex-col p-4 gap-4 max-w-2xl mx-auto w-full">
        <h2 className="text-xl font-bold text-center">Phase de vote</h2>
        <Timer seconds={30} />
        <div className="space-y-4 flex-1 overflow-y-auto">
          {others.map(player => (
            <div key={player.socketId} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="font-semibold mb-3 text-indigo-400">{player.username}</div>
              {votePhase.categories.map(cat => {
                const ans = player.answers[cat]?.trim()
                const key = `${player.socketId}:${cat}`
                return (
                  <div key={cat} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div>
                      <span className="text-xs text-gray-500 block">{cat}</span>
                      <span className={`font-medium ${!ans ? 'text-gray-600 italic' : ''}`}>{ans || '(vide)'}</span>
                    </div>
                    {ans && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => vote(player.socketId, cat, true)}
                          disabled={votes[key] !== undefined}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${votes[key] === true ? 'bg-green-500/30 text-green-400' : 'bg-white/5 hover:bg-green-500/20 hover:text-green-400 disabled:opacity-50'}`}
                        >✓</button>
                        <button
                          onClick={() => vote(player.socketId, cat, false)}
                          disabled={votes[key] !== undefined}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${votes[key] === false ? 'bg-red-500/30 text-red-400' : 'bg-white/5 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50'}`}
                        >✗</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <Scoreboard scores={scores} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">Manche {gameState.round as number} / {gameState.totalRounds as number}</div>
        <div className="text-4xl font-black text-indigo-400 tracking-widest">{gameState.letter as string}</div>
      </div>

      {!submitted && <Timer seconds={gameState.timeLeft as number} onEnd={submitAnswers} />}

      <div className="flex-1 space-y-3 overflow-y-auto">
        {categories.map(cat => (
          <div key={cat}>
            <label className="block text-sm text-gray-400 mb-1">{cat}</label>
            <input
              value={answers[cat] || ''}
              onChange={e => setAnswers(a => ({ ...a, [cat]: e.target.value }))}
              disabled={submitted}
              placeholder={`${cat} commençant par ${gameState.letter}...`}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
            />
          </div>
        ))}
      </div>

      {!submitted ? (
        <button onClick={submitAnswers} className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold transition-colors">
          Valider mes réponses
        </button>
      ) : (
        <div className="text-center py-3 text-green-400 font-medium">✓ Réponses envoyées, en attente des autres...</div>
      )}

      <Scoreboard scores={scores} />
    </div>
  )
}
