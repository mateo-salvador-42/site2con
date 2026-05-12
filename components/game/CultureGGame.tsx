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

export function CultureGGame({ session, gameState, onAction }: Props) {
  const router = useRouter()
  const [chosen, setChosen] = useState<number | null>(null)
  const [result, setResult] = useState<{ correct: boolean } | null>(null)
  const [roundResult, setRoundResult] = useState<{ correctAnswer: number; correctOption: string; scores: { username: string; score: number }[] } | null>(null)
  const [scores, setScores] = useState(session.players)
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null)
  const socket = getSocket()

  useEffect(() => {
    setChosen(null)
    setResult(null)
    setRoundResult(null)
  }, [gameState.questionIndex])

  useEffect(() => {
    socket.on('game:loading', ({ message }: { message: string }) => setLoadingMsg(message))
    socket.on('game:answer-result', (r: { correct: boolean }) => setResult(r))
    socket.on('game:round-end', (r: { correctAnswer: number; correctOption: string; scores: { username: string; score: number }[] }) => setRoundResult(r))
    socket.on('game:score-update', (s: { username: string; score: number }[]) => setScores(s))
    return () => {
      socket.off('game:loading')
      socket.off('game:answer-result')
      socket.off('game:round-end')
      socket.off('game:score-update')
    }
  }, [socket])

  if (loadingMsg && gameState.phase === 'starting') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-spin">🧠</div>
          <p className="text-gray-300 font-medium">{loadingMsg}</p>
          <p className="text-sm text-gray-500">Connexion à Open Trivia DB...</p>
        </div>
      </div>
    )
  }

  if (gameState.phase === 'over') {
    const s = (gameState.scores as { username: string; score: number }[]) || scores
    return <GameOver scores={s} onHome={() => router.push('/')} />
  }

  const options = gameState.options as string[]

  function pick(idx: number) {
    if (chosen !== null || roundResult) return
    setChosen(idx)
    onAction('submit-answer', idx)
  }

  function getOptionStyle(idx: number) {
    if (!roundResult && chosen === null) return 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-indigo-500/50 cursor-pointer'
    if (roundResult && idx === roundResult.correctAnswer) return 'bg-green-500/20 border-green-500 text-green-300 font-bold'
    if (roundResult && chosen === idx && idx !== roundResult.correctAnswer) return 'bg-red-500/20 border-red-500 text-red-400'
    if (!roundResult && chosen === idx) return result?.correct ? 'bg-green-500/20 border-green-500' : 'bg-white/10 border-white/20'
    return 'bg-white/5 border-white/10 opacity-50'
  }

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          Question {(gameState.questionIndex as number) + 1} / {gameState.totalQuestions as number}
        </div>
        {gameState.category && (
          <span className="text-xs px-2 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
            {gameState.category as string}
          </span>
        )}
      </div>

      {!roundResult && <Timer seconds={gameState.timeLeft as number} />}

      <div className="flex-1 flex flex-col justify-center gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
          <p className="text-xl font-semibold">{gameState.question as string}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {options?.map((opt, i) => (
            <button
              key={i}
              onClick={() => pick(i)}
              className={`p-4 rounded-xl border text-left transition-all ${getOptionStyle(i)}`}
            >
              <span className="text-xs text-gray-500 block mb-1">{['A', 'B', 'C', 'D'][i]}</span>
              <span className="font-medium">{opt}</span>
            </button>
          ))}
        </div>

        {chosen !== null && !roundResult && (
          <div className="text-center text-sm text-gray-400 py-2">
            {result ? (result.correct ? '✓ Bonne réponse !' : 'Mauvaise réponse...') : 'Réponse envoyée, en attente...'}
          </div>
        )}
      </div>

      <Scoreboard scores={scores} />
    </div>
  )
}
