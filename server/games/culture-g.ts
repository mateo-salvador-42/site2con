import type { Server } from 'socket.io'
import type { GameHandler, GameSession } from '../../types/game'
import { fetchCultureGQuestions, type CultureGQuestion } from './culture-g-fetcher'
import { saveGameResult } from '../save-stats'

export const CULTURE_G_CATEGORIES = ['Géographie', 'Histoire', 'Sciences', 'Sport', 'TV & Cinéma', 'Musique', 'Arts & Littérature', 'Jeux vidéos', 'Gastronomie', 'Culture générale', 'Actu & Politique']

const BETWEEN_ROUNDS = 3_000

export const cultureGHandler: GameHandler = {
  getInitialState(settings) {
    return {
      questions: [],
      questionCount: (settings.questionCount as number) || 10,
      roundDuration: ((settings.roundDuration as number) || 15) * 1000,
      categories: (settings.categories as string[])?.length
        ? (settings.categories as string[])
        : CULTURE_G_CATEGORIES,
      currentQuestionIndex: 0,
      answers: {},
      roundTimer: null,
    }
  },

  async onStart(session, io) {
    const count = session.gameState.questionCount as number
    const categories = session.gameState.categories as string[]

    io.to(session.code).emit('game:loading', { message: 'Chargement des questions...' })

    const questions = await fetchCultureGQuestions(count, categories)

    if (questions.length === 0) {
      io.to(session.code).emit('game:error', { message: 'Impossible de charger les questions. Réessaie.' })
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
      const answers = session.gameState.answers as Record<string, number>
      if (answers[player.socketId] !== undefined) return

      const chosen = action.payload as number
      const questions = session.gameState.questions as CultureGQuestion[]
      const idx = session.gameState.currentQuestionIndex as number
      const isCorrect = chosen === questions[idx].answer

      answers[player.socketId] = chosen

      if (isCorrect) {
        const elapsed = Date.now() - (session.gameState.roundStartedAt as number)
        const bonus = Math.max(0, Math.floor((session.gameState.roundDuration as number - elapsed) / 1000))
        player.score += 10 + bonus
      }

      socket.emit('game:answer-result', { correct: isCorrect })
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
  const questions = session.gameState.questions as CultureGQuestion[]
  const q = questions[idx]
  session.gameState.roundStartedAt = Date.now()
  session.gameState.answers = {}

  io.to(session.code).emit('game:state', {
    phase: 'question',
    questionIndex: idx,
    totalQuestions: questions.length,
    question: q.question,
    category: q.category,
    options: q.options,
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

  const questions = session.gameState.questions as CultureGQuestion[]
  const idx = session.gameState.currentQuestionIndex as number

  io.to(session.code).emit('game:round-end', {
    correctAnswer: questions[idx].answer,
    correctOption: questions[idx].options[questions[idx].answer],
    scores: getScores(session),
  })

  const next = idx + 1
  if (next >= questions.length) {
    setTimeout(() => {
      const finalScores = getScores(session).sort((a, b) => b.score - a.score)
      session.status = 'finished'
      io.to(session.code).emit('game:over', { scores: finalScores })
      saveGameResult(session.gameType, finalScores).catch(console.error)
    }, BETWEEN_ROUNDS)
    return
  }

  session.gameState.currentQuestionIndex = next
  setTimeout(() => sendQuestion(session, io, next), BETWEEN_ROUNDS)
}
