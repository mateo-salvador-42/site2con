import type { Server, Socket } from 'socket.io'
import type { GameHandler, GameSession, GameAction, Player } from '../../types/game'
import { fetchRandomQuestions, type LyricQuestion } from './lyrics-fetcher'

const BETWEEN_ROUNDS = 4_000

function normalize(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export const lyricsHandler: GameHandler = {
  getInitialState(settings) {
    return {
      questions: [],
      questionCount: (settings.questionCount as number) || 5,
      roundDuration: ((settings.roundDuration as number) || 25) * 1000,
      currentQuestionIndex: 0,
      answers: {},
      roundTimer: null,
      roundStartedAt: 0,
    }
  },

  async onStart(session, io) {
    const count = session.gameState.questionCount as number

    io.to(session.code).emit('game:loading', { message: 'Chargement des paroles...' })

    const questions = await fetchRandomQuestions(count)

    if (questions.length === 0) {
      io.to(session.code).emit('game:error', { message: 'Impossible de charger les paroles. Réessaie.' })
      session.status = 'lobby'
      return
    }

    session.gameState.questions = questions
    session.gameState.currentQuestionIndex = 0
    session.gameState.answers = {}

    sendQuestion(session, io, 0)
  },

  onAction(session, player, action, io, socket) {
    if (action.type === 'submit-answer') {
      const answers = session.gameState.answers as Record<string, string>
      if (answers[player.socketId]) return

      const userAnswer = normalize(action.payload as string)
      const questions = session.gameState.questions as LyricQuestion[]
      const idx = session.gameState.currentQuestionIndex as number
      const correct = normalize(questions[idx].answer)

      const isCorrect = userAnswer === correct
      answers[player.socketId] = userAnswer

      if (isCorrect) {
        const elapsed = Date.now() - (session.gameState.roundStartedAt as number)
        const bonus = Math.max(0, Math.floor((session.gameState.roundDuration as number - elapsed) / 1000))
        player.score += 10 + bonus
      }

      socket.emit('game:answer-result', { correct: isCorrect, correctAnswer: isCorrect ? undefined : questions[idx].answer })
      io.to(session.code).emit('game:score-update', getScores(session))

      const allAnswered = [...session.players.values()].every(p => answers[p.socketId] !== undefined)
      if (allAnswered) endRound(session, io)
    }
  },

  onPlayerLeave(session, _player, io) {
    io.to(session.code).emit('game:score-update', getScores(session))
  },
}

function getScores(session: GameSession) {
  return [...session.players.values()].map(p => ({ username: p.username, score: p.score }))
}

function sendQuestion(session: GameSession, io: Server, idx: number) {
  const questions = session.gameState.questions as LyricQuestion[]
  const q = questions[idx]
  session.gameState.roundStartedAt = Date.now()
  session.gameState.answers = {}

  io.to(session.code).emit('game:state', {
    phase: 'question',
    questionIndex: idx,
    totalQuestions: questions.length,
    lyrics: q.lyrics,
    artist: q.artist,
    song: q.song,
    hint: q.hint,
    timeLeft: session.gameState.roundDuration as number / 1000,
  })

  const timer = setTimeout(() => endRound(session, io), session.gameState.roundDuration as number)
  session.gameState.roundTimer = timer as unknown as number
}

function endRound(session: GameSession, io: Server) {
  if (session.gameState.roundTimer) {
    clearTimeout(session.gameState.roundTimer as unknown as ReturnType<typeof setTimeout>)
    session.gameState.roundTimer = null
  }

  const questions = session.gameState.questions as LyricQuestion[]
  const idx = session.gameState.currentQuestionIndex as number

  io.to(session.code).emit('game:round-end', {
    correctAnswer: questions[idx].answer,
    scores: getScores(session),
  })

  const next = idx + 1
  if (next >= questions.length) {
    setTimeout(() => {
      session.status = 'finished'
      io.to(session.code).emit('game:over', { scores: getScores(session).sort((a, b) => b.score - a.score) })
    }, BETWEEN_ROUNDS)
    return
  }

  session.gameState.currentQuestionIndex = next
  setTimeout(() => sendQuestion(session, io, next), BETWEEN_ROUNDS)
}
