const SONGS = [
  { artist: 'Stromae', song: 'Alors on danse' },
  { artist: 'Stromae', song: 'Formidable' },
  { artist: 'Stromae', song: 'Papaoutai' },
  { artist: 'Angele', song: 'Balance ton quoi' },
  { artist: 'Angele', song: 'Tout oublier' },
  { artist: 'Aya Nakamura', song: 'Djadja' },
  { artist: 'Aya Nakamura', song: 'Copines' },
  { artist: 'Ninho', song: 'Jefe' },
  { artist: 'Ninho', song: 'Merci' },
  { artist: 'Nekfeu', song: 'Etoiles' },
  { artist: 'Soprano', song: 'Cosmo' },
  { artist: 'Vianney', song: 'Pas là' },
  { artist: 'Vianney', song: 'Je m aime' },
  { artist: 'Maître Gims', song: 'Bella' },
  { artist: 'Maître Gims', song: 'Zombie' },
  { artist: 'Jul', song: 'Bande organisée' },
  { artist: 'Kendji Girac', song: 'Color Gitano' },
  { artist: 'Grand Corps Malade', song: 'Funambule' },
  { artist: 'Indochine', song: 'L Aventurier' },
  { artist: 'Damso', song: 'Ipséité' },
]

const SKIP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou',
  'est', 'en', 'à', 'au', 'aux', 'je', 'tu', 'il', 'elle', 'on',
  'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'ma', 'ta',
  'sa', 'mon', 'ton', 'son', 'que', 'qui', 'ne', 'pas', 'plus',
  'si', 'car', 'mais', 'par', 'sur', 'sous', 'avec', 'dans', 'pour',
  'quand', 'donc', 'or', 'ni', 'car', 'y', 'en', 'lui',
])

export interface LyricQuestion {
  artist: string
  song: string
  lyrics: string
  answer: string
  hint: string
}

async function fetchLyrics(artist: string, song: string): Promise<string | null> {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json() as { lyrics?: string }
    return data.lyrics?.trim() || null
  } catch {
    return null
  }
}

function extractQuestion(lyrics: string, artist: string, song: string): LyricQuestion | null {
  const lines = lyrics
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 25 && l.split(' ').length >= 5 && !l.startsWith('['))

  for (let attempt = 0; attempt < 15; attempt++) {
    const line = lines[Math.floor(Math.random() * lines.length)]
    if (!line) continue

    const words = line.split(' ')
    const candidates = words
      .map((w, idx) => ({ word: w.replace(/[^a-zA-ZÀ-ÿ'-]/g, ''), idx }))
      .filter(({ word }) => word.length >= 4 && !SKIP_WORDS.has(word.toLowerCase()))

    if (candidates.length === 0) continue

    const { word, idx } = candidates[Math.floor(Math.random() * candidates.length)]
    const answer = word.toLowerCase()
    const hint = answer[0] + '_'.repeat(answer.length - 1)
    const blanked = words.map((w, i) => i === idx ? '___' : w).join(' ')

    return { artist, song, lyrics: blanked, answer, hint }
  }

  return null
}

export async function fetchRandomQuestions(count: number): Promise<LyricQuestion[]> {
  const shuffled = [...SONGS].sort(() => Math.random() - 0.5)
  const questions: LyricQuestion[] = []

  for (const { artist, song } of shuffled) {
    if (questions.length >= count) break

    const lyrics = await fetchLyrics(artist, song)
    if (!lyrics) continue

    const q = extractQuestion(lyrics, artist, song)
    if (q) questions.push(q)
  }

  return questions
}
