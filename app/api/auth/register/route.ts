import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { username, email, password } = await req.json()

  if (!username?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Mot de passe trop court (6 min)' }, { status: 400 })
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })

  if (existing) {
    const field = existing.email === email ? 'Email' : 'Nom d\'utilisateur'
    return NextResponse.json({ error: `${field} déjà utilisé` }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { username: username.trim(), email: email.trim(), passwordHash },
  })

  return NextResponse.json({ id: user.id, username: user.username }, { status: 201 })
}
