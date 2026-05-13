import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const gameType = req.nextUrl.searchParams.get('gameType') || 'total'

  const stats = await prisma.userStat.findMany({
    where: { gameType },
    orderBy: [{ wins: 'desc' }, { totalScore: 'desc' }],
    take: 50,
    include: { user: { select: { username: true } } },
  })

  return NextResponse.json(
    stats.map((s: typeof stats[number], i: number) => ({
      rank: i + 1,
      username: s.user.username,
      wins: s.wins,
      gamesPlayed: s.gamesPlayed,
      totalScore: s.totalScore,
      bestScore: s.bestScore,
    }))
  )
}
