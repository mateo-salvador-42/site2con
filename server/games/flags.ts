import type { Server } from 'socket.io'
import type { GameHandler, GameSession } from '../../types/game'
import { EASY_COUNTRIES, ALL_COUNTRIES, matchesCountry, type Country } from './flags-data'
import { saveGameResult } from '../save-stats'

const POINTS_BY_RANK = [10, 7, 5, 3, 2]
const BETWEEN_ROUNDS = 4_000

function getPoints(rank: number): number {
  return POINTS_BY_RANK[rank] ?? 1
}

function getScores(session: GameSession) {
  return [...session.players.values()].map(p => ({ username: p.username, score: p.score }))
}

function flagEmojiToCode(flag: string): string {
  return [...flag].map(c => String.fromCharCode(c.codePointAt(0)! - 0x1F1E6 + 65)).join('').toLowerCase()
}

function sendFlag(session: GameSession, io: Server, idx: number) {
  const flags = session.gameState.flags as Country[]
  const f = flags[idx]
  session.gameState.roundStartedAt = Date.now()
  session.gameState.correctOrder = []

  io.to(session.code).emit('game:state', {
    phase: 'question',
    flagIndex: idx,
    totalFlags: flags.length,
    flagCode: flagEmojiToCode(f.flag),
    timeLeft: (session.gameState.roundDuration as number) / 1000,
  })

  const timer = setTimeout(() => endRound(session, io), session.gameState.roundDuration as number)
  session.gameState.roundTimer = timer as unknown as number
}

function endRound(session: GameSession, io: Server) {
  if (session.gameState.roundTimer) {
    clearTimeout(session.gameState.roundTimer as unknown as ReturnType<typeof setTimeout>)
    session.gameState.roundTimer = null
  }

  const flags = session.gameState.flags as Country[]
  const idx = session.gameState.currentIndex as number
  const current = flags[idx]

  io.to(session.code).emit('game:round-end', {
    answer: current.name,
    flagCode: flagEmojiToCode(current.flag),
    scores: getScores(session),
  })

  const next = idx + 1
  if (next >= flags.length) {
    setTimeout(() => {
      const finalScores = getScores(session).sort((a, b) => b.score - a.score)
      session.status = 'finished'
      io.to(session.code).emit('game:over', { scores: finalScores })
      saveGameResult(session.gameType, finalScores).catch(console.error)
    }, BETWEEN_ROUNDS)
    return
  }

  session.gameState.currentIndex = next
  setTimeout(() => sendFlag(session, io, next), BETWEEN_ROUNDS)
}

export const flagsHandler: GameHandler = {
  getInitialState(settings) {
    const count = (settings.roundCount as number) || 10
    const duration = ((settings.roundDuration as number) || 20) * 1000
    const difficulty = (settings.difficulty as string) || 'facile'
    const pool = difficulty === 'difficile' ? ALL_COUNTRIES : EASY_COUNTRIES
    const flags = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(count, pool.length))

    return {
      flags,
      roundCount: flags.length,
      roundDuration: duration,
      currentIndex: 0,
      correctOrder: [],
      roundTimer: null,
      roundStartedAt: 0,
    }
  },

  async onStart(session, io) {
    sendFlag(session, io, 0)
  },

  onAction(session, player, action, io, socket) {
    if (action.type !== 'guess') return

    const guess = (action.payload as string)?.trim()
    if (!guess) return

    const flags = session.gameState.flags as Country[]
    const idx = session.gameState.currentIndex as number
    const current = flags[idx]
    const correctOrder = session.gameState.correctOrder as string[]

    if (correctOrder.includes(player.socketId)) return

    if (matchesCountry(guess, current)) {
      correctOrder.push(player.socketId)
      const rank = correctOrder.length - 1
      const points = getPoints(rank)
      player.score += points

      socket.emit('game:answer-result', { correct: true, rank: rank + 1, points })
      io.to(session.code).emit('game:correct-answer', {
        username: player.username,
        rank: rank + 1,
        points,
        scores: getScores(session),
      })

      if (correctOrder.length >= session.players.size) endRound(session, io)
    } else {
      socket.emit('game:answer-result', { correct: false })
    }
  },

  onPlayerLeave(session, _player, io) {
    const correctOrder = session.gameState.correctOrder as string[]
    const remaining = [...session.players.values()].filter(p => !correctOrder.includes(p.socketId))
    if (remaining.length === 0 && session.status === 'playing') endRound(session, io)
    io.to(session.code).emit('game:score-update', getScores(session))
  },
}
