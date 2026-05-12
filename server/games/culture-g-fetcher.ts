const CATEGORY_MAP: Record<string, number> = {
  'Géographie':  22,
  'Histoire':    23,
  'Sciences':    17,
  'Sport':       21,
  'Cinéma & TV': 11,
  'Musique':     12,
  'Littérature': 10,
  'Jeux vidéo':  15,
}

type OpenTDBResult = {
  category: string
  question: string
  correct_answer: string
  incorrect_answers: string[]
}

type OpenTDBResponse = {
  response_code: number
  results: OpenTDBResult[]
}

export type CultureGQuestion = {
  question: string
  options: string[]
  answer: number
  category: string
}

function decodeHtml(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
}

async function fetchFromOpenTDB(amount: number, categoryId?: number): Promise<CultureGQuestion[]> {
  try {
    let url = `https://opentdb.com/api.php?amount=${amount}&type=multiple`
    if (categoryId) url += `&category=${categoryId}`

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []

    const data = await res.json() as OpenTDBResponse
    if (data.response_code !== 0) return []

    return data.results.map(q => {
      const shuffled = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5)
      const answerIndex = shuffled.indexOf(q.correct_answer)

      return {
        question: decodeHtml(q.question),
        options: shuffled.map(decodeHtml),
        answer: answerIndex,
        category: decodeHtml(q.category),
      }
    })
  } catch {
    return []
  }
}

export async function fetchCultureGQuestions(count: number, categories: string[]): Promise<CultureGQuestion[]> {
  const categoryIds = categories.map(c => CATEGORY_MAP[c]).filter(Boolean)

  if (categoryIds.length === 0) {
    return fetchFromOpenTDB(count)
  }

  const perCategory = Math.ceil(count / categoryIds.length)

  const results = await Promise.all(categoryIds.map(id => fetchFromOpenTDB(perCategory, id)))

  return results.flat().sort(() => Math.random() - 0.5).slice(0, count)
}
