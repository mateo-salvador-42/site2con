import { prisma } from '../lib/prisma'

type ScoreEntry = { username: string; score: number }

export async function saveGameResult(gameType: string, scores: ScoreEntry[]) {
  if (scores.length === 0) return

  const winnerScore = scores[0].score
  const usernames = scores.map(s => s.username)

  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true },
  })
  if (users.length === 0) return

  const userMap = new Map(users.map(u => [u.username, u.id]))
  const userIds = users.map(u => u.id)

  const existingStats = await prisma.userStat.findMany({
    where: { userId: { in: userIds }, gameType: { in: [gameType, 'total'] } },
  })
  const statKey = (userId: string, gt: string) => `${userId}:${gt}`
  const statMap = new Map(existingStats.map(s => [statKey(s.userId, s.gameType), s]))

  await Promise.all(
    scores.flatMap(({ username, score }) => {
      const userId = userMap.get(username)
      if (!userId) return []

      const isWinner = score === winnerScore

      const upsertStat = (gt: string) => {
        const existing = statMap.get(statKey(userId, gt))
        return prisma.userStat.upsert({
          where: { userId_gameType: { userId, gameType: gt } },
          create: { userId, gameType: gt, wins: isWinner ? 1 : 0, gamesPlayed: 1, totalScore: score, bestScore: score },
          update: {
            wins: { increment: isWinner ? 1 : 0 },
            gamesPlayed: { increment: 1 },
            totalScore: { increment: score },
            bestScore: Math.max(score, existing?.bestScore ?? 0),
          },
        })
      }

      return [upsertStat(gameType), upsertStat('total')]
    })
  )
}
