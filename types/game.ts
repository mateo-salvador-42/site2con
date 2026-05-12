import type { Server, Socket } from 'socket.io'

export type GameType = 'lyrics' | 'culture-g' | 'petit-bac' | 'flags'
export type SessionStatus = 'lobby' | 'playing' | 'finished'

export interface Player {
  socketId: string
  userId?: string
  username: string
  score: number
  isHost: boolean
  isReady: boolean
}

export interface GameSession {
  code: string
  gameType: GameType
  status: SessionStatus
  players: Map<string, Player>
  hostSocketId: string
  settings: Record<string, unknown>
  gameState: Record<string, unknown>
  createdAt: Date
}

export interface GameAction {
  type: string
  payload: unknown
}

export interface GameHandler {
  onStart(session: GameSession, io: Server): void | Promise<void>
  onAction(session: GameSession, player: Player, action: GameAction, io: Server, socket: Socket): void
  onPlayerLeave(session: GameSession, player: Player, io: Server): void
  getInitialState(settings: Record<string, unknown>): Record<string, unknown>
}

export type SessionMap = Map<string, GameSession>
