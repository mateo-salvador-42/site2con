import type { Server } from 'socket.io'
import type { GameHandler, GameSession } from '../../types/game'

export const PETIT_BAC_PRESETS = ['Prénom', 'Animal', 'Pays', 'Ville', 'Fruit/Légume', 'Métier', 'Objet', 'Couleur', 'Film/Série', 'Marque', 'Sport', 'Plante', 'Célébrité', 'Instrument', 'Boisson']

const LETTERS = 'ABCDEFGHIJKLMNOPRSTV'.split('')
const VOTE_DURATION = 45_000

export const petitBacHandler: GameHandler = {
  getInitialState(settings) {
    const roundCount = (settings.roundCount as number) || 3
    const categories = (settings.categories as string[])?.length
      ? (settings.categories as string[])
      : PETIT_BAC_PRESETS.slice(0, 5)
    const pool = (settings.letters as string[])?.length
      ? (settings.letters as string[])
      : LETTERS
    const letters = [...pool].sort(() => Math.random() - 0.5).slice(0, roundCount)
    return {
      categories,
      letters,
      currentRound: 0,
      roundCount,
      roundDuration: ((settings.roundDuration as number) || 60) * 1000,
      endMode: (settings.endMode as string) || 'timer',
      submissions: {},
      votes: {},
      confirmedVoters: new Set<string>(),
      phase: 'waiting',
      roundTimer: null,
      stopTriggeredBy: null,
    }
  },

  onStart(session, io) {
    startRound(session, io, 0)
  },

  onAction(session, player, action, io, socket) {
    if (action.type === 'submit-answers') {
      if (session.gameState.phase !== 'writing') return
      const submissions = session.gameState.submissions as Record<string, Record<string, string>>
      if (submissions[player.socketId]) return

      submissions[player.socketId] = action.payload as Record<string, string>
      socket.emit('game:submitted', { ok: true })

      const allSubmitted = [...session.players.values()].every(p => submissions[p.socketId])
      if (allSubmitted) { startVoting(session, io); return }

      const endMode = session.gameState.endMode as string
      if (endMode === 'stop' && !session.gameState.stopTriggeredBy) {
        session.gameState.stopTriggeredBy = player.username
        startVoting(session, io)
      }
    }

    if (action.type === 'finalize-votes') {
      if (session.gameState.phase !== 'voting') return
      const { invalids } = action.payload as { invalids: { targetSocketId: string; category: string }[] }

      const votes = session.gameState.votes as Record<string, Record<string, boolean>>
      const categories = session.gameState.categories as string[]
      const others = [...session.players.values()].filter(p => p.socketId !== player.socketId)

      for (const other of others) {
        if (!votes[other.socketId]) votes[other.socketId] = {}
        for (const cat of categories) {
          votes[other.socketId][`${cat}:${player.socketId}`] = true
        }
      }
      for (const { targetSocketId, category } of invalids) {
        if (!votes[targetSocketId]) votes[targetSocketId] = {}
        votes[targetSocketId][`${category}:${player.socketId}`] = false
      }

      const confirmed = session.gameState.confirmedVoters as Set<string>
      confirmed.add(player.socketId)
      if (confirmed.size >= session.players.size) endRound(session, io)
    }
  },

  onPlayerLeave(session, _player, io) {
    io.to(session.code).emit('game:score-update', getScores(session))
    if (session.gameState.phase === 'voting') {
      const confirmed = session.gameState.confirmedVoters as Set<string>
      if (confirmed.size >= session.players.size) endRound(session, io)
    }
  },
}

function getScores(session: GameSession) {
  return [...session.players.values()].map(p => ({ username: p.username, score: p.score }))
}

function startRound(session: GameSession, io: Server, idx: number) {
  const letters = session.gameState.letters as string[]
  const categories = session.gameState.categories as string[]
  const endMode = session.gameState.endMode as string

  session.gameState.submissions = {}
  session.gameState.votes = {}
  session.gameState.confirmedVoters = new Set<string>()
  session.gameState.currentRound = idx
  session.gameState.phase = 'writing'
  session.gameState.stopTriggeredBy = null

  io.to(session.code).emit('game:state', {
    phase: 'writing',
    round: idx + 1,
    totalRounds: session.gameState.roundCount as number,
    letter: letters[idx],
    categories,
    timeLeft: session.gameState.roundDuration as number / 1000,
    endMode,
  })

  if (endMode === 'timer') {
    const timer = setTimeout(() => startVoting(session, io), session.gameState.roundDuration as number)
    session.gameState.roundTimer = timer as unknown as number
  }
}

function startVoting(session: GameSession, io: Server) {
  if (session.gameState.phase !== 'writing') return

  if (session.gameState.roundTimer) {
    clearTimeout(session.gameState.roundTimer as unknown as ReturnType<typeof setTimeout>)
    session.gameState.roundTimer = null
  }

  session.gameState.phase = 'voting'
  session.gameState.confirmedVoters = new Set<string>()

  const submissions = session.gameState.submissions as Record<string, Record<string, string>>
  const letters = session.gameState.letters as string[]
  const idx = session.gameState.currentRound as number

  const playerSubmissions = [...session.players.values()].map(p => ({
    socketId: p.socketId,
    username: p.username,
    answers: submissions[p.socketId] || {},
  }))

  io.to(session.code).emit('game:vote-phase', {
    letter: letters[idx],
    submissions: playerSubmissions,
    categories: session.gameState.categories,
    timeLeft: VOTE_DURATION / 1000,
  })

  const timer = setTimeout(() => endRound(session, io), VOTE_DURATION)
  session.gameState.roundTimer = timer as unknown as number
}

function endRound(session: GameSession, io: Server) {
  if (session.gameState.phase !== 'voting') return
  session.gameState.phase = 'round-end'

  if (session.gameState.roundTimer) {
    clearTimeout(session.gameState.roundTimer as unknown as ReturnType<typeof setTimeout>)
    session.gameState.roundTimer = null
  }

  const votes = session.gameState.votes as Record<string, Record<string, boolean>>
  const submissions = session.gameState.submissions as Record<string, Record<string, string>>
  const categories = session.gameState.categories as string[]
  const roundScores: Record<string, number> = {}

  for (const [socketId, player] of session.players) {
    let roundScore = 0
    for (const cat of categories) {
      const answer = (submissions[socketId] || {})[cat]?.trim()
      if (!answer) continue

      const catVotes = Object.entries(votes[socketId] || {}).filter(([k]) => k.startsWith(`${cat}:`))
      const invalidCount = catVotes.filter(([, v]) => !v).length
      const totalVoters = session.players.size - 1

      if (totalVoters === 0 || invalidCount <= totalVoters / 2) {
        const isDuplicate = [...session.players.values()]
          .filter(p => p.socketId !== socketId)
          .some(p => (submissions[p.socketId] || {})[cat]?.trim().toLowerCase() === answer.toLowerCase())

        roundScore += isDuplicate ? 5 : 10
      }
    }
    player.score += roundScore
    roundScores[player.username] = roundScore
  }

  const idx = session.gameState.currentRound as number
  const roundCount = session.gameState.roundCount as number

  io.to(session.code).emit('game:round-end', {
    scores: getScores(session),
    roundScores,
    submissions: Object.fromEntries(
      [...session.players.values()].map(p => [p.username, submissions[p.socketId] || {}])
    ),
  })

  if (idx + 1 >= roundCount) {
    setTimeout(() => {
      session.status = 'finished'
      io.to(session.code).emit('game:over', { scores: getScores(session).sort((a, b) => b.score - a.score) })
    }, 6000)
  } else {
    setTimeout(() => startRound(session, io, idx + 1), 6000)
  }
}
