import assert from 'node:assert/strict'
import test from 'node:test'
import { questions, categories } from '../src/questions.ts'
import { createGame, gameReducer, initialGame, QUESTIONS_PER_GAME, resultMessage } from '../src/quiz.ts'

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

test('bank has exactly 100 unique questions, four distinct answers and one matching key', () => {
  assert.equal(questions.length, 100)
  assert.equal(new Set(questions.map(q => q.id)).size, 100)
  assert.equal(new Set(questions.map(q => q.prompt.toLocaleLowerCase('sv'))).size, 100)
  for (const q of questions) {
    assert.equal(q.options.length, 4, q.id)
    assert.equal(new Set(q.options).size, 4, q.id)
    assert.equal(q.options.filter(option => option === q.answer).length, 1, q.id)
    assert.ok(categories.includes(q.category), q.id)
    assert.ok(q.prompt.endsWith('?') && q.explanation.length > 10, q.id)
    assert.ok(q.options.every(option => option.trim().length > 0), q.id)
  }
})

test('1000 seeded rounds have no repeated questions, preserve answers and never mutate the bank', () => {
  const before = JSON.stringify(questions)
  const answerPositions = new Set()
  const seen = new Set()
  let previous = []
  const random = seededRandom(42)
  for (let round = 0; round < 1000; round++) {
    const turns = createGame(previous, random)
    assert.equal(turns.length, QUESTIONS_PER_GAME)
    const ids = turns.map(turn => turn.question.id)
    assert.equal(new Set(ids).size, QUESTIONS_PER_GAME)
    assert.ok(ids.every(id => !previous.includes(id)))
    for (const turn of turns) {
      assert.deepEqual([...turn.options].sort(), [...turn.question.options].sort())
      answerPositions.add(turn.options.indexOf(turn.question.answer))
      seen.add(turn.question.id)
    }
    previous = ids
  }
  assert.equal(seen.size, 100)
  assert.equal(answerPositions.size, 4)
  assert.equal(JSON.stringify(questions), before)
})

test('every final score 0–10 is correct; answers and next clicks cannot be counted twice', () => {
  for (let target = 0; target <= 10; target++) {
    const turns = createGame([], seededRandom(target + 1))
    let game = gameReducer(initialGame, { type: 'start', turns })
    for (let index = 0; index < 10; index++) {
      const turn = turns[index]
      const questionId = turn.question.id
      assert.equal(game.index, index)
      assert.equal(gameReducer(game, { type: 'next', questionId }), game)
      assert.equal(gameReducer(game, { type: 'answer', questionId, option: 'invalid' }), game)
      const option = index < target ? turn.question.answer : turn.options.find(o => o !== turn.question.answer)
      game = gameReducer(game, { type: 'answer', questionId, option })
      assert.equal(gameReducer(game, { type: 'answer', questionId, option: turn.question.answer }), game)
      assert.equal(gameReducer(game, { type: 'skip', questionId }), game)
      game = gameReducer(game, { type: 'next', questionId })
      assert.equal(gameReducer(game, { type: 'next', questionId }), game)
    }
    assert.equal(game.phase, 'finished')
    assert.equal(game.score, target)
    assert.equal(game.index, 9)
    assert.ok(resultMessage(target).length > 20)
    game = gameReducer(game, { type: 'start', turns: createGame(turns.map(t => t.question.id)) })
    assert.equal(game.score, 0)
    assert.equal(game.index, 0)
    assert.equal(game.chosenAnswer, null)
    assert.equal(game.wasSkipped, false)
  }
})

test('revealing an answer earns no point and still completes the round', () => {
  let game = gameReducer(initialGame, { type: 'start', turns: createGame() })
  for (const turn of game.turns) {
    const questionId = turn.question.id
    game = gameReducer(game, { type: 'skip', questionId })
    assert.equal(gameReducer(game, { type: 'answer', questionId, option: turn.question.answer }), game)
    game = gameReducer(game, { type: 'next', questionId })
  }
  assert.equal(game.phase, 'finished')
  assert.equal(game.score, 0)
})
