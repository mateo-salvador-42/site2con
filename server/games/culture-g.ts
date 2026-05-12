import type { Server, Socket } from 'socket.io'
import type { GameHandler, GameSession, GameAction, Player } from '../../types/game'

const QUESTIONS = [
  { id: 1, question: 'Quelle est la capitale de la France ?', options: ['Lyon', 'Paris', 'Marseille', 'Bordeaux'], answer: 1 },
  { id: 2, question: 'Combien de côtés a un hexagone ?', options: ['5', '6', '7', '8'], answer: 1 },
  { id: 3, question: 'Qui a peint la Joconde ?', options: ['Michel-Ange', 'Raphaël', 'Léonard de Vinci', 'Botticelli'], answer: 2 },
  { id: 4, question: 'Quelle planète est la plus grande du système solaire ?', options: ['Saturne', 'Uranus', 'Neptune', 'Jupiter'], answer: 3 },
  { id: 5, question: "En quelle année a eu lieu la Révolution française ?", options: ['1779', '1789', '1799', '1769'], answer: 1 },
  { id: 6, question: 'Quel est l\'élément chimique dont le symbole est O ?', options: ['Or', 'Osmium', 'Oxygène', 'Ozone'], answer: 2 },
  { id: 7, question: 'Combien de joueurs compte une équipe de football ?', options: ['9', '10', '11', '12'], answer: 2 },
  { id: 8, question: 'Quel pays a la plus grande superficie au monde ?', options: ['Canada', 'Chine', 'USA', 'Russie'], answer: 3 },
  { id: 9, question: 'Qui a écrit Les Misérables ?', options: ['Balzac', 'Zola', 'Victor Hugo', 'Flaubert'], answer: 2 },
  { id: 10, question: 'Quelle est la monnaie du Japon ?', options: ['Yuan', 'Won', 'Yen', 'Ringgit'], answer: 2 },
]

const ROUND_DURATION = 15_000
const BETWEEN_ROUNDS = 3_000

export const cultureGHandler: GameHandler = {
  getInitialState(settings) {
    const count = (settings.questionCount as number) || 10
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, count)
    return {
      questions: shuffled,
      currentQuestionIndex: 0,
      answers: {},
      roundTimer: null,
    }
  },

  onStart(session, io) {
    session.gameState.answers = {}
    sendQuestion(session, io, 0)
  },

  onAction(session, player, action, io, socket) {
    if (action.type === 'submit-answer') {
      const answers = session.gameState.answers as Record<string, number>
      if (answers[player.socketId] !== undefined) return

      const chosen = action.payload as number
      const questions = session.gameState.questions as typeof QUESTIONS
      const idx = session.gameState.currentQuestionIndex as number
      const isCorrect = chosen === questions[idx].answer

      answers[player.socketId] = chosen

      if (isCorrect) {
        const elapsed = Date.now() - (session.gameState.roundStartedAt as number)
        const bonus = Math.max(0, Math.floor((ROUND_DURATION - elapsed) / 1000))
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
  const questions = session.gameState.questions as typeof QUESTIONS
  const q = questions[idx]
  session.gameState.roundStartedAt = Date.now()
  session.gameState.answers = {}

  io.to(session.code).emit('game:state', {
    phase: 'question',
    questionIndex: idx,
    totalQuestions: questions.length,
    question: q.question,
    options: q.options,
    timeLeft: ROUND_DURATION / 1000,
  })

  const timer = setTimeout(() => endRound(session, io), ROUND_DURATION)
  session.gameState.roundTimer = timer as unknown as number
}

function endRound(session: GameSession, io: Server) {
  if (session.gameState.roundTimer) {
    clearTimeout(session.gameState.roundTimer as unknown as ReturnType<typeof setTimeout>)
    session.gameState.roundTimer = null
  }

  const questions = session.gameState.questions as typeof QUESTIONS
  const idx = session.gameState.currentQuestionIndex as number

  io.to(session.code).emit('game:round-end', {
    correctAnswer: questions[idx].answer,
    correctOption: questions[idx].options[questions[idx].answer],
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
