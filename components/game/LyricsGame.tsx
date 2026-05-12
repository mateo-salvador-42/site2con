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

export function LyricsGame({ session, gameState, onAction }: Props) {
  const router = useRouter()
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<{ correct: boolean; correctAnswer?: string } | null>(null)
  const [roundResult, setRoundResult] = useState<{ correctAnswer: string; scores: { username: string; score: number }[] } | null>(null)
  const [scores, setScores] = useState(session.players)
  const socket = getSocket()

  useEffect(() => {
    setAnswer('')
    setSubmitted(false)
    setResult(null)
    setRoundResult(null)
  }, [gameState.questionIndex])

  useEffect(() => {
    socket.on('game:answer-result', (r: { correct: boolean; correctAnswer?: string }) => setResult(r))
    socket.on('game:round-end', (r: { correctAnswer: string; scores: { username: string; score: number }[] }) => setRoundResult(r))
    socket.on('game:score-update', (s: { username: string; score: number }[]) => setScores(s))
    return () => {
      socket.off('game:answer-result')
      socket.off('game:round-end')
      socket.off('game:score-update')
    }
  }, [socket])

  if (gameState.phase === 'over') {
    const s = (gameState.scores as { username: string; score: number }[]) || scores
    return <GameOver scores={s} onHome={() => router.push('/')} />
  }

  function submit() {
    if (!answer.trim() || submitted) return
    setSubmitted(true)
    onAction('submit-answer', answer.trim())
  }

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          Question {(gameState.questionIndex as number) + 1} / {gameState.totalQuestions as number}
        </div>
        <div className="text-sm text-gray-400">{gameState.artist as string} — {gameState.song as string}</div>
      </div>

      {!roundResult && <Timer seconds={gameState.timeLeft as number} />}

      <div className="flex-1 flex flex-col justify-center gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <p className="text-xl leading-relaxed text-center font-medium">
            {(gameState.lyrics as string)?.split('___').map((part, i, arr) => (
              <span key={i}>
                {part}
                {i < arr.length - 1 && (
                  <span className="inline-block min-w-20 border-b-2 border-indigo-400 mx-2 text-indigo-400 font-bold">
                    {result ? (result.correct ? answer : result.correctAnswer || '???') : '_____'}
                  </span>
                )}
              </span>
            ))}
          </p>
          <p className="text-center text-sm text-gray-500 mt-3">Indice : <span className="font-mono text-gray-300">{gameState.hint as string}</span></p>
        </div>

        {!submitted && !roundResult ? (
          <div className="flex gap-2">
            <input
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Ta réponse..."
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
            <button onClick={submit} className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold transition-colors">
              Envoyer
            </button>
          </div>
        ) : submitted && !roundResult && (
          <div className={`text-center p-4 rounded-xl ${result?.correct ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'bg-white/5 border border-white/10 text-gray-400'}`}>
            {result?.correct ? '✓ Bonne réponse !' : '⏳ Réponse envoyée, en attente...'}
          </div>
        )}

        {roundResult && (
          <div className={`text-center p-4 rounded-xl ${result?.correct ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'bg-red-500/20 border border-red-500/30 text-red-400'}`}>
            La réponse était : <span className="font-bold">{roundResult.correctAnswer}</span>
          </div>
        )}
      </div>

      <Scoreboard scores={scores} />
    </div>
  )
}
