import type { Server, Socket } from 'socket.io'
import type { GameHandler, GameSession, GameAction, Player } from '../../types/game'

const CATEGORIES = ['Prénom', 'Animal', 'Pays', 'Ville', 'Fruit/Légume', 'Métier', 'Objet', 'Couleur']
const LETTERS = 'ABCDEFGHIJKLMNOPRSTV'.split('')
const ROUND_DURATION = 60_000
const VOTE_DURATION = 30_000

export const petitBacHandler: GameHandler = {
  getInitialState(settings) {
    const roundCount = (settings.roundCount as number) || 3
    const categories = (settings.categories as string[]) || CATEGORIES.slice(0, 5)
    const letters = [...LETTERS].sort(() => Math.random() - 0.5).slice(0, roundCount)
    return {
      categories,
      letters,
      currentRound: 0,
      roundCount,
      submissions: {},
      votes: {},
      phase: 'waiting',
      roundTimer: null,
    }
  },

  onStart(session, io) {
    startRound(session, io, 0)
  },

  onAction(session, player, action, io, socket) {
    if (action.type === 'submit-answers') {
      const submissions = session.gameState.submissions as Record<string, Record<string, string>>
      if (submissions[player.socketId]) return

      submissions[player.socketId] = action.payload as Record<string, string>
      socket.emit('game:submitted', { ok: true })

      const allSubmitted = [...session.players.values()].every(p => submissions[p.socketId])
      if (allSubmitted) startVoting(session, io)
    }

    if (action.type === 'vote') {
      const votes = session.gameState.votes as Record<string, Record<string, boolean>>
      const { targetSocketId, category, valid } = action.payload as {
        targetSocketId: string
        category: string
        valid: boolean
      }

      if (!votes[targetSocketId]) votes[targetSocketId] = {}
      votes[targetSocketId][`${category}:${player.socketId}`] = valid

      const expected = countExpectedVotes(session)
      const actual = Object.values(votes).reduce((sum, v) => sum + Object.keys(v).length, 0)
      if (actual >= expected) endRound(session, io)
    }
  },

  onPlayerLeave(session, _player, io) {
    io.to(session.code).emit('game:score-update', getScores(session))
  },
}

function countExpectedVotes(session: GameSession) {
  const cats = (session.gameState.categories as string[]).length
  const players = session.players.size
  return players * (players - 1) * cats
}

function getScores(session: GameSession) {
  return [...session.players.values()].map(p => ({ username: p.username, score: p.score }))
}

function startRound(session: GameSession, io: Server, idx: number) {
  const letters = session.gameState.letters as string[]
  const categories = session.gameState.categories as string[]
  session.gameState.submissions = {}
  session.gameState.votes = {}
  session.gameState.currentRound = idx
  session.gameState.phase = 'writing'

  io.to(session.code).emit('game:state', {
    phase: 'writing',
    round: idx + 1,
    totalRounds: (session.gameState.roundCount as number),
    letter: letters[idx],
    categories,
    timeLeft: ROUND_DURATION / 1000,
  })

  const timer = setTimeout(() => startVoting(session, io), ROUND_DURATION)
  session.gameState.roundTimer = timer as unknown as number
}

function startVoting(session: GameSession, io: Server) {
  if (session.gameState.roundTimer) {
    clearTimeout(session.gameState.roundTimer as unknown as ReturnType<typeof setTimeout>)
    session.gameState.roundTimer = null
  }

  session.gameState.phase = 'voting'
  const submissions = session.gameState.submissions as Record<string, Record<string, string>>

  const playerSubmissions = [...session.players.values()].map(p => ({
    socketId: p.socketId,
    username: p.username,
    answers: submissions[p.socketId] || {},
  }))

  io.to(session.code).emit('game:vote-phase', {
    submissions: playerSubmissions,
    categories: session.gameState.categories,
    timeLeft: VOTE_DURATION / 1000,
  })

  const timer = setTimeout(() => endRound(session, io), VOTE_DURATION)
  session.gameState.roundTimer = timer as unknown as number
}

function endRound(session: GameSession, io: Server) {
  if (session.gameState.roundTimer) {
    clearTimeout(session.gameState.roundTimer as unknown as ReturnType<typeof setTimeout>)
    session.gameState.roundTimer = null
  }

  const votes = session.gameState.votes as Record<string, Record<string, boolean>>
  const submissions = session.gameState.submissions as Record<string, Record<string, string>>
  const categories = session.gameState.categories as string[]

  for (const [socketId, player] of session.players) {
    let roundScore = 0
    for (const cat of categories) {
      const answer = (submissions[socketId] || {})[cat]?.trim()
      if (!answer) continue

      const playerVotes = Object.entries(votes[socketId] || {})
        .filter(([k]) => k.startsWith(`${cat}:`))

      const validVotes = playerVotes.filter(([, v]) => v).length
      const totalVoters = session.players.size - 1

      if (totalVoters === 0 || validVotes > totalVoters / 2) {
        const isDuplicate = [...session.players.values()]
          .filter(p => p.socketId !== socketId)
          .some(p => (submissions[p.socketId] || {})[cat]?.trim().toLowerCase() === answer.toLowerCase())

        roundScore += isDuplicate ? 5 : 10
      }
    }
    player.score += roundScore
  }

  const idx = session.gameState.currentRound as number
  const roundCount = session.gameState.roundCount as number

  io.to(session.code).emit('game:round-end', {
    scores: getScores(session),
  })

  if (idx + 1 >= roundCount) {
    setTimeout(() => {
      session.status = 'finished'
      io.to(session.code).emit('game:over', { scores: getScores(session).sort((a, b) => b.score - a.score) })
    }, 3000)
  } else {
    setTimeout(() => startRound(session, io, idx + 1), 4000)
  }
}
