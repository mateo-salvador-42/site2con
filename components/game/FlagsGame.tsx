'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket-client'
import { Timer } from './Timer'
import { GameOver } from './Scoreboard'

type Props = {
  session: { players: { username: string; score: number }[] }
  gameState: Record<string, unknown>
  onAction: (type: string, payload: unknown) => void
  mySocketId: string
}

type CorrectAnswer = { username: string; rank: number; points: number }

const RANK_LABELS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export function FlagsGame({ session, gameState, onAction }: Props) {
  const router = useRouter()
  const socket = getSocket()
  const inputRef = useRef<HTMLInputElement>(null)

  const [guess, setGuess] = useState('')
  const [answered, setAnswered] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [correctAnswers, setCorrectAnswers] = useState<CorrectAnswer[]>([])
  const [roundResult, setRoundResult] = useState<{ answer: string; flagCode: string } | null>(null)
  const [scores, setScores] = useState(session.players)
  const [myResult, setMyResult] = useState<{ rank: number; points: number } | null>(null)

  useEffect(() => {
    setGuess('')
    setAnswered(false)
    setWrong(false)
    setCorrectAnswers([])
    setRoundResult(null)
    setMyResult(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [gameState.flagIndex])

  useEffect(() => {
    socket.on('game:correct-answer', (data: CorrectAnswer & { scores: { username: string; score: number }[] }) => {
      setCorrectAnswers(prev => [...prev, { username: data.username, rank: data.rank, points: data.points }])
      setScores(data.scores)
    })
    socket.on('game:answer-result', (r: { correct: boolean; rank?: number; points?: number }) => {
      if (r.correct) {
        setAnswered(true)
        setMyResult({ rank: r.rank!, points: r.points! })
      } else {
        setWrong(true)
        setTimeout(() => setWrong(false), 600)
        setGuess('')
      }
    })
    socket.on('game:round-end', (r: { answer: string; flagCode: string; scores: { username: string; score: number }[] }) => {
      setRoundResult(r)
      setScores(r.scores)
    })
    socket.on('game:score-update', (s: { username: string; score: number }[]) => setScores(s))

    return () => {
      socket.off('game:correct-answer')
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
    if (!guess.trim() || answered || roundResult) return
    onAction('guess', guess.trim())
  }

  const sortedScores = [...scores].sort((a, b) => b.score - a.score)

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 max-w-2xl mx-auto w-full">

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          Drapeau {(gameState.flagIndex as number) + 1} / {gameState.totalFlags as number}
        </div>
        {myResult && (
          <span className="text-sm font-bold text-green-400">
            {RANK_LABELS[myResult.rank] ?? '✓'} +{myResult.points} pts
          </span>
        )}
      </div>

      {!roundResult && <Timer seconds={gameState.timeLeft as number} />}

      <div className="flex-1 flex flex-col justify-center gap-6">

        <div className="text-center">
          <img
            src={`https://flagcdn.com/w320/${(roundResult?.flagCode ?? gameState.flagCode) as string}.png`}
            alt="Drapeau"
            className="h-44 w-auto object-contain mx-auto rounded-lg shadow-lg"
          />
          {roundResult && (
            <div className="mt-4 text-2xl font-bold text-white">
              {roundResult.answer}
            </div>
          )}
        </div>

        {!roundResult && (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={guess}
              onChange={e => setGuess(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              disabled={answered}
              placeholder="Écris le pays..."
              className={`flex-1 px-4 py-3 rounded-xl border text-lg font-medium focus:outline-none transition-all ${
                answered
                  ? 'bg-green-500/10 border-green-500 text-green-300 cursor-not-allowed'
                  : wrong
                  ? 'bg-red-500/10 border-red-500 text-red-300'
                  : 'bg-white/5 border-white/10 focus:border-indigo-500'
              }`}
            />
            <button
              onClick={submit}
              disabled={answered || !guess.trim()}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors"
            >
              OK
            </button>
          </div>
        )}

        {correctAnswers.length > 0 && (
          <div className="space-y-1.5">
            {correctAnswers.map((ca, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-sm">
                <span className="text-lg">{RANK_LABELS[ca.rank] ?? '✓'}</span>
                <span className="font-medium text-green-300">{ca.username}</span>
                <span className="ml-auto text-green-400 font-mono">+{ca.points} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 pt-3 space-y-1">
        {sortedScores.map((p, i) => (
          <div key={p.username} className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 w-4">{i + 1}.</span>
            <span className="flex-1 text-gray-300">{p.username}</span>
            <span className="font-mono font-bold text-indigo-400">{p.score} pts</span>
          </div>
        ))}
      </div>

    </div>
  )
}
