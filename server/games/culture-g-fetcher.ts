const CATEGORY_MAP: Record<string, string> = {
  'Géographie':       'geographie',
  'Histoire':         'histoire',
  'Sciences':         'science',
  'Sport':            'sport',
  'TV & Cinéma':      'tv_cinema',
  'Musique':          'musique',
  'Arts & Littérature': 'art_litterature',
  'Jeux vidéos':      'jeux_videos',
  'Gastronomie':      'gastronomie',
  'Culture générale': 'culture_generale',
  'Actu & Politique': 'actu_politique',
}

const SLUG_TO_DISPLAY: Record<string, string> = {
  geographie:       'Géographie',
  histoire:         'Histoire',
  science:          'Sciences',
  sport:            'Sport',
  tv_cinema:        'TV & Cinéma',
  musique:          'Musique',
  art_litterature:  'Arts & Littérature',
  jeux_videos:      'Jeux vidéos',
  gastronomie:      'Gastronomie',
  culture_generale: 'Culture générale',
  actu_politique:   'Actu & Politique',
}

type QuizzAPIResult = {
  question: string
  answer: string
  category: string
  badAnswers: string[]
}

type QuizzAPIResponse = {
  count: number
  quizzes: QuizzAPIResult[]
}

export type CultureGQuestion = {
  question: string
  options: string[]
  answer: number
  category: string
}

async function fetchFromQuizzAPI(amount: number, category?: string): Promise<CultureGQuestion[]> {
  try {
    let url = `https://quizzapi.jomoreschi.fr/api/v2/quiz?limit=${Math.min(amount, 20)}`
    if (category) url += `&category=${category}`

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []

    const data = await res.json() as QuizzAPIResponse
    if (!data.quizzes?.length) return []

    return data.quizzes.map(q => {
      const shuffled = [...q.badAnswers, q.answer].sort(() => Math.random() - 0.5)
      return {
        question: q.question,
        options: shuffled,
        answer: shuffled.indexOf(q.answer),
        category: SLUG_TO_DISPLAY[q.category] ?? q.category,
      }
    })
  } catch {
    return []
  }
}

export async function fetchCultureGQuestions(count: number, categories: string[]): Promise<CultureGQuestion[]> {
  const categorySlugs = categories.map(c => CATEGORY_MAP[c]).filter(Boolean)

  if (categorySlugs.length === 0) {
    return fetchFromQuizzAPI(count)
  }

  const perCategory = Math.ceil(count / categorySlugs.length)
  const results = await Promise.all(
    categorySlugs.map(slug => fetchFromQuizzAPI(perCategory, slug))
  )

  return results.flat().sort(() => Math.random() - 0.5).slice(0, count)
}
