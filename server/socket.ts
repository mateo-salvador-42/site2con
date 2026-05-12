import type { Server, Socket } from 'socket.io'
import type { GameSession, GameType, Player, SessionMap } from '../types/game'
import { lyricsHandler } from './games/lyrics'
import { cultureGHandler } from './games/culture-g'
import { petitBacHandler } from './games/petit-bac'

const GAME_HANDLERS = {
  'lyrics': lyricsHandler,
  'culture-g': cultureGHandler,
  'petit-bac': petitBacHandler,
}

const sessions: SessionMap = new Map()
const socketToSession: Map<string, string> = new Map()

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function getPublicSession(session: GameSession) {
  return {
    code: session.code,
    gameType: session.gameType,
    status: session.status,
    players: [...session.players.values()].map(p => ({
      socketId: p.socketId,
      username: p.username,
      score: p.score,
      isHost: p.isHost,
      isReady: p.isReady,
    })),
    settings: session.settings,
  }
}

export function setupSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    socket.on('session:create', ({ gameType, username, settings = {} }: {
      gameType: GameType
      username: string
      settings?: Record<string, unknown>
    }, cb: (res: { ok: boolean; code?: string; error?: string }) => void) => {
      if (!GAME_HANDLERS[gameType]) return cb({ ok: false, error: 'Jeu inconnu' })
      if (!username?.trim()) return cb({ ok: false, error: 'Nom requis' })

      let code = generateCode()
      while (sessions.has(code)) code = generateCode()

      const handler = GAME_HANDLERS[gameType]
      const player: Player = {
        socketId: socket.id,
        username: username.trim(),
        score: 0,
        isHost: true,
        isReady: false,
      }

      const session: GameSession = {
        code,
        gameType,
        status: 'lobby',
        players: new Map([[socket.id, player]]),
        hostSocketId: socket.id,
        settings,
        gameState: handler.getInitialState(settings),
        createdAt: new Date(),
      }

      sessions.set(code, session)
      socketToSession.set(socket.id, code)
      socket.join(code)
      cb({ ok: true, code })
      io.to(code).emit('session:updated', getPublicSession(session))
    })

    socket.on('session:join', ({ code, username }: { code: string; username: string }, cb: (res: { ok: boolean; error?: string }) => void) => {
      const session = sessions.get(code.toUpperCase())
      if (!session) return cb({ ok: false, error: 'Session introuvable' })
      if (session.status !== 'lobby') return cb({ ok: false, error: 'La partie a déjà commencé' })
      if (!username?.trim()) return cb({ ok: false, error: 'Nom requis' })
      if (session.players.size >= 8) return cb({ ok: false, error: 'Session pleine (max 8)' })

      const nameTaken = [...session.players.values()].some(p => p.username.toLowerCase() === username.trim().toLowerCase())
      if (nameTaken) return cb({ ok: false, error: 'Ce nom est déjà pris' })

      const player: Player = {
        socketId: socket.id,
        username: username.trim(),
        score: 0,
        isHost: false,
        isReady: false,
      }

      session.players.set(socket.id, player)
      socketToSession.set(socket.id, code.toUpperCase())
      socket.join(code.toUpperCase())
      cb({ ok: true })
      io.to(code.toUpperCase()).emit('session:updated', getPublicSession(session))
    })

    socket.on('session:get', ({ code }: { code: string }, cb: (res: { ok: boolean; session?: ReturnType<typeof getPublicSession>; error?: string }) => void) => {
      const session = sessions.get(code.toUpperCase())
      if (!session) return cb({ ok: false, error: 'Session introuvable' })
      cb({ ok: true, session: getPublicSession(session) })
      if (session.status === 'playing') {
        socket.emit('game:state', session.gameState)
      }
    })

    socket.on('session:ready', (_, cb: (res: { ok: boolean }) => void) => {
      const code = socketToSession.get(socket.id)
      const session = code ? sessions.get(code) : undefined
      const player = session?.players.get(socket.id)
      if (!player) return cb({ ok: false })

      player.isReady = !player.isReady
      cb({ ok: true })
      io.to(code!).emit('session:updated', getPublicSession(session!))
    })

    socket.on('game:start', (_, cb: (res: { ok: boolean; error?: string }) => void) => {
      const code = socketToSession.get(socket.id)
      const session = code ? sessions.get(code) : undefined
      if (!session) return cb({ ok: false, error: 'Session introuvable' })
      if (session.hostSocketId !== socket.id) return cb({ ok: false, error: 'Seul le host peut démarrer' })
      if (session.status !== 'lobby') return cb({ ok: false, error: 'Partie déjà en cours' })
      if (session.players.size < 1) return cb({ ok: false, error: 'Pas assez de joueurs' })

      session.status = 'playing'
      cb({ ok: true })
      io.to(code!).emit('session:updated', getPublicSession(session))
      io.to(code!).emit('game:starting', { gameType: session.gameType })

      const handler = GAME_HANDLERS[session.gameType]
      setTimeout(async () => {
        await handler.onStart(session, io)
      }, 1000)
    })

    socket.on('game:action', (action: { type: string; payload: unknown }) => {
      const code = socketToSession.get(socket.id)
      const session = code ? sessions.get(code) : undefined
      const player = session?.players.get(socket.id)
      if (!session || !player || session.status !== 'playing') return

      const handler = GAME_HANDLERS[session.gameType]
      handler.onAction(session, player, action, io, socket)
    })

    socket.on('disconnect', () => {
      const code = socketToSession.get(socket.id)
      if (!code) return

      const session = sessions.get(code)
      if (!session) return

      const player = session.players.get(socket.id)
      session.players.delete(socket.id)
      socketToSession.delete(socket.id)

      if (session.players.size === 0) {
        sessions.delete(code)
        return
      }

      if (session.hostSocketId === socket.id) {
        const newHost = session.players.values().next().value
        if (newHost) {
          newHost.isHost = true
          session.hostSocketId = newHost.socketId
        }
      }

      if (player) {
        const handler = GAME_HANDLERS[session.gameType]
        handler.onPlayerLeave(session, player, io)
      }

      io.to(code).emit('session:updated', getPublicSession(session))
      io.to(code).emit('session:player-left', { username: player?.username })
    })
  })
}
