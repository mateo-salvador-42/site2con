import type { Server, Socket } from 'socket.io'
import type { GameHandler, GameSession, GameAction, Player } from '../../types/game'

const QUESTIONS = [
  {
    id: 1,
    artist: 'Stromae',
    song: 'Alors on danse',
    lyrics: 'Qui dit études dit ___ et puis le chômage',
    answer: 'travail',
    hint: 't____l',
  },
  {
    id: 2,
    artist: 'Jul',
    song: 'Tchikita',
    lyrics: 'Tchikita, tchikita, je veux être ton ___',
    answer: 'mec',
    hint: 'm__',
  },
  {
    id: 3,
    artist: 'Angèle',
    song: 'Balance ton quoi',
    lyrics: "T'as qu'à te _____, je t'en prie",
    answer: 'taire',
    hint: 't____',
  },
  {
    id: 4,
    artist: 'PNL',
    song: 'Jusqu\'au dernier gramme',
    lyrics: 'Dans ma rue on rêve pas, on ___ les nuits',
    answer: 'compte',
    hint: 'c_____',
  },
  {
    id: 5,
    artist: 'Vianney',
    song: 'Pas là',
    lyrics: "Je m'en vais mais je suis ___, au fond de toi",
    answer: 'là',
    hint: '__',
  },
]

const ROUND_DURATION = 20_000
const BETWEEN_ROUNDS = 4_000

export const lyricsHandler: GameHandler = {
  getInitialState(settings) {
    const questionCount = (settings.questionCount as number) || 5
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5).slice(0, questionCount)
    return {
      questions: shuffled,
      currentQuestionIndex: 0,
      currentQuestion: shuffled[0],
      answers: {},
      roundActive: false,
      roundTimer: null,
    }
  },

  onStart(session, io) {
    session.gameState.roundActive = true
    session.gameState.answers = {}
    const q = (session.gameState.questions as typeof QUESTIONS)[0]

    io.to(session.code).emit('game:state', {
      phase: 'question',
      questionIndex: 0,
      totalQuestions: (session.gameState.questions as typeof QUESTIONS).length,
      lyrics: q.lyrics,
      artist: q.artist,
      song: q.song,
      hint: q.hint,
      timeLeft: ROUND_DURATION / 1000,
    })

    scheduleNextRound(session, io)
  },

  onAction(session, player, action, io, socket) {
    if (action.type === 'submit-answer') {
      const answers = session.gameState.answers as Record<string, string>
      if (answers[player.socketId]) return

      const userAnswer = (action.payload as string).trim().toLowerCase()
      const questions = session.gameState.questions as typeof QUESTIONS
      const idx = session.gameState.currentQuestionIndex as number
      const correct = questions[idx].answer.toLowerCase()

      const isCorrect = userAnswer === correct
      answers[player.socketId] = userAnswer

      if (isCorrect) {
        const playersLeft = (ROUND_DURATION - ((Date.now() - (session.gameState.roundStartedAt as number)) || 0)) / 1000
        const bonus = Math.max(0, Math.floor(playersLeft))
        player.score += 10 + bonus
      }

      socket.emit('game:answer-result', { correct: isCorrect, correctAnswer: isCorrect ? correct : undefined })
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

function scheduleNextRound(session: GameSession, io: Server) {
  session.gameState.roundStartedAt = Date.now()
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
  const correct = questions[idx].answer

  io.to(session.code).emit('game:round-end', {
    correctAnswer: correct,
    scores: getScores(session),
  })

  const next = idx + 1
  if (next >= questions.length) {
    setTimeout(() => endGame(session, io), BETWEEN_ROUNDS)
    return
  }

  session.gameState.currentQuestionIndex = next
  session.gameState.answers = {}

  setTimeout(() => {
    const q = questions[next]
    io.to(session.code).emit('game:state', {
      phase: 'question',
      questionIndex: next,
      totalQuestions: questions.length,
      lyrics: q.lyrics,
      artist: q.artist,
      song: q.song,
      hint: q.hint,
      timeLeft: ROUND_DURATION / 1000,
    })
    scheduleNextRound(session, io)
  }, BETWEEN_ROUNDS)
}

function endGame(session: GameSession, io: Server) {
  session.status = 'finished'
  const scores = getScores(session).sort((a, b) => b.score - a.score)
  io.to(session.code).emit('game:over', { scores })
}
