import { questions, type Question } from './questions.ts'

export const QUESTIONS_PER_GAME = 10
export type Turn = { question: Question; options: string[] }
export type Game = {
  phase: 'ready' | 'playing' | 'finished'
  turns: Turn[]
  index: number
  chosenAnswer: string | null
  wasSkipped: boolean
  score: number
}
export type Action =
  | { type: 'start'; turns: Turn[] }
  | { type: 'answer'; questionId: string; option: string }
  | { type: 'skip'; questionId: string }
  | { type: 'next'; questionId: string }

export const initialGame: Game = {
  phase: 'ready', turns: [], index: 0, chosenAnswer: null, wasSkipped: false, score: 0,
}

// Fisher–Yates: retained from the original quiz. Never change the source bank.
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function createGame(previousIds: readonly string[] = [], random = Math.random): Turn[] {
  // A replay also avoids the immediately preceding round's questions.
  const fresh = questions.filter((question) => !previousIds.includes(question.id))
  const pool = fresh.length >= QUESTIONS_PER_GAME ? fresh : questions
  return shuffled(pool, random).slice(0, QUESTIONS_PER_GAME).map((question) => ({
    question, options: shuffled(question.options, random),
  }))
}

export function gameReducer(game: Game, action: Action): Game {
  if (action.type === 'start') {
    return { ...initialGame, phase: 'playing', turns: action.turns }
  }
  const turn = game.turns[game.index]
  if (game.phase !== 'playing' || !turn || turn.question.id !== action.questionId) return game
  const revealed = game.chosenAnswer !== null || game.wasSkipped
  if (action.type === 'answer') {
    if (revealed || !turn.options.includes(action.option)) return game
    return {
      ...game, chosenAnswer: action.option,
      score: game.score + Number(action.option === turn.question.answer),
    }
  }
  if (action.type === 'skip') {
    return revealed ? game : { ...game, wasSkipped: true }
  }
  if (!revealed) return game
  if (game.index === game.turns.length - 1) return { ...game, phase: 'finished' }
  return { ...game, index: game.index + 1, chosenAnswer: null, wasSkipped: false }
}

export function resultMessage(score: number): string {
  if (score === QUESTIONS_PER_GAME) return 'Full pott! Vilken rymdkoll! Fortsätt utforska med CAESAR.'
  if (score >= 7) return 'Snyggt jobbat, rymdutforskare! Du har lärt dig massor. Redo för ett nytt uppdrag?'
  if (score >= 4) return 'Bra jobbat! Varje fråga hjälper dig att upptäcka mer om rymden. Fortsätt vara nyfiken!'
  return 'Bra kämpat! Nu har du upptäckt nya rymdfakta. Testa igen och fortsätt lära dig med CAESAR!'
}
