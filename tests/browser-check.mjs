// Optional local browser QA. Uses installed Chrome, Node and CDP; no extra packages.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { questions } from '../src/questions.ts'

const url = process.env.QUIZ_URL ?? 'http://127.0.0.1:5175/'
assert.equal((await fetch(url)).status, 200, 'Preview must respond successfully')
const profile = await mkdtemp(join(tmpdir(), 'caesar-quiz-qa-'))
const browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let ws
const pending = new Map()
let sequence = 0
const errors = []
try {
  let port
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) }
  }
  assert.ok(port, 'Chrome debugging endpoint must start')
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id)
      clearTimeout(timer)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
  }
  function send(method, params = {}) {
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
      pending.set(id, { resolve, reject, timer })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  async function click(selector, text) {
    await evaluate(`(() => { const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => ${text === undefined ? 'true' : `b.innerText.includes(${JSON.stringify(text)})`}); if (!button) throw new Error('Missing button'); button.click(); })()`)
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  }
  async function layout(width) {
    const state = await evaluate(`({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      grid: document.querySelector('.answer-grid') && getComputedStyle(document.querySelector('.answer-grid')).gridTemplateColumns,
      lang: document.documentElement.lang, bg: getComputedStyle(document.body).backgroundColor,
      overflow: [...document.querySelectorAll('button,.question-card,.category-picker,h1,h2')].filter(e => { const r=e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth+1; }).map(e => e.textContent)
    })`)
    assert.equal(state.lang, 'sv')
    assert.equal(state.bg, 'rgb(12, 12, 12)')
    assert.ok(state.scroll <= width, JSON.stringify(state))
    assert.deepEqual(state.overflow, [])
    if (state.grid) assert.equal(state.grid.split(' ').length, width <= 640 ? 1 : 2)
  }
  async function screenshot(name) {
    await mkdir('.qa', { recursive: true })
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(`.qa/${name}.png`, Buffer.from(data, 'base64'))
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  let priorPrompts = []
  for (const [sizeIndex, width] of [1280, 390, 320, 768].entries()) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 641 })
    if (sizeIndex === 0) {
      await send('Page.navigate', { url })
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate("!!document.querySelector('.next-button')")) break
        await delay(100)
      }
      await layout(width)
      await screenshot('desktop-start')
    }
    await click('.next-button', sizeIndex === 0 ? 'Starta quizet' : 'Spela igen')
    assert.equal(await evaluate("document.activeElement.id"), 'question-title')
    let score = 0
    const prompts = []
    for (let index = 0; index < 10; index++) {
      await layout(width)
      const prompt = await evaluate("document.querySelector('#question-title').textContent")
      assert.ok(!prompts.includes(prompt), 'No duplicate within a game')
      assert.ok(!priorPrompts.includes(prompt), 'Replay must use fresh questions')
      prompts.push(prompt)
      const question = questions.find(q => q.prompt === prompt)
      assert.ok(question)
      assert.equal(await evaluate("document.querySelector('.question-count').textContent"), `Fråga ${index + 1} av 10`)
      if (index === 0 && width === 390) await screenshot('mobile-question')
      if (index === 2 && sizeIndex !== 2) {
        await click('.skip-button')
      } else {
        const correct = sizeIndex === 2 || index % 2 === 0
        const answer = correct ? question.answer : question.options.find(option => option !== question.answer)
        await click('.answer-option', answer)
        if (correct) score++
        assert.ok((await evaluate("document.querySelector('.feedback-heading').textContent")).includes(correct ? 'Rätt svar!' : 'Fel svar!'))
      }
      assert.equal(await evaluate("document.querySelectorAll('.answer-option:disabled').length"), 4)
      assert.equal(await evaluate("document.querySelectorAll('.is-correct').length"), 1)
      assert.equal(await evaluate("document.querySelector('.is-correct .answer-text').textContent"), question.answer)
      assert.equal(await evaluate("document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')"), String(index + 1))
      await layout(width)
      if (index === 1 && width === 1280) await screenshot('desktop-feedback')
      await click('.next-button', index === 9 ? 'Visa resultat' : 'Nästa fråga')
    }
    assert.equal(await evaluate("document.querySelector('#question-title').textContent"), 'Ditt resultat')
    assert.equal(await evaluate("document.querySelector('.result-score').textContent"), `${score} av 10 rätt`)
    assert.equal(await evaluate("document.activeElement.id"), 'question-title')
    await layout(width)
    if (width === 320) await screenshot('mobile-result')
    priorPrompts = prompts
    console.log(`PASS ${width}px: 10 questions, feedback, score ${score}/10, progress, replay, focus and no overflow`)
  }
  assert.deepEqual(errors, [], 'No browser runtime errors')
  await send('Browser.close')
} finally {
  ws?.close()
  browser.kill()
}
