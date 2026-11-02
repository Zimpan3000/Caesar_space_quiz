import { useEffect, useReducer, useRef } from 'react'
import { ArrowRight, Check, CircleHelp, Lightbulb, Rocket, RotateCcw, SkipForward, Sparkles, X } from 'lucide-react'
import { questions } from './questions'
import { createGame, gameReducer, initialGame, QUESTIONS_PER_GAME, resultMessage } from './quiz'
import './App.css'

function App() {
  const [game, dispatch] = useReducer(gameReducer, initialGame)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { phase, turns, index, chosenAnswer, wasSkipped, score } = game
  const turn = turns[index]
  const revealed = chosenAnswer !== null || wasSkipped
  const completed = phase === 'finished' ? QUESTIONS_PER_GAME : phase === 'playing' ? index + Number(revealed) : 0
  const correctAnswer = turn?.question.answer

  useEffect(() => {
    if (phase !== 'ready') headingRef.current?.focus()
  }, [phase, index, turns])

  function startGame() {
    dispatch({ type: 'start', turns: createGame(turns.map(({ question }) => question.id)) })
  }

  return (
    <div className="app-shell">
      <header className="topbar flex items-center justify-between">
        <a className="brand inline-flex items-center" href="#top" aria-label="CAESARs rymdquiz, till toppen">
          <span className="brand-mark"><Rocket size={19} strokeWidth={1.8} aria-hidden="true" /></span>
          <span>CAESAR<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-tools flex items-center">
          <div className="stat-item" title="Rätt svar i den här omgången">
            <span className="stat-number">{score}</span>
            <span className="stat-label">rätt svar</span>
          </div>
          <span className="stat-divider" aria-hidden="true" />
          <div className="stat-item" title="Antal frågor i omgången">
            <span className="stat-number">{QUESTIONS_PER_GAME}</span>
            <span className="stat-label">frågor</span>
          </div>
        </div>
      </header>

      <main className="main-content mx-auto" id="top">
        <div className="intro-row">
          <div className="intro-copy">
            <p className="eyebrow"><span className="eyebrow-dot" /> Upptäck rymden med CAESAR</p>
            <h1>CAESARs Rymdquiz<span className="heading-period">.</span></h1>
            <p className="intro-subtitle">Hur mycket kan du om rymden? Testa dina kunskaper med CAESAR!</p>
          </div>
          <div className="category-picker">
            <span className="category-icon"><CircleHelp size={16} aria-hidden="true" /></span>
            <span>{questions.length} rymdfrågor</span>
          </div>
        </div>

        <section className="question-card" aria-labelledby="question-title">
          <div className="question-meta flex items-center justify-between">
            <span className="category-tag">{phase === 'playing' ? turn.question.category : 'Ditt rymduppdrag'}</span>
            <span className="question-count">
              {phase === 'playing' ? `Fråga ${index + 1} av ${QUESTIONS_PER_GAME}` : phase === 'finished' ? 'Uppdraget är klart!' : `${QUESTIONS_PER_GAME} frågor per omgång`}
            </span>
          </div>
          <div className="progress-track" role="progressbar" aria-label="Frågor klara i omgången"
            aria-valuemin={0} aria-valuemax={QUESTIONS_PER_GAME} aria-valuenow={completed}
            aria-valuetext={`${completed} av ${QUESTIONS_PER_GAME} frågor klara`}>
            <div className="progress-fill" style={{ width: `${completed / QUESTIONS_PER_GAME * 100}%` }} />
          </div>

          {phase === 'ready' && (
            <>
              <div className="question-content">
                <h2 id="question-title">Redo för ett rymduppdrag?</h2>
                <p className="answer-hint">Du får 10 slumpade frågor om rymden. Välj ett av fyra svar och lär dig något nytt efter varje fråga.</p>
                <p className="round-description">Från månen till raketverkstaden – följ med studentraketlaget CAESAR! Ta den tid du behöver. Varje rätt svar ger en poäng. Väljer du ”Visa svaret” får du lära dig svaret utan att få poäng.</p>
              </div>
              <div className="card-footer flex items-center justify-between">
                <span className="gentle-reminder"><Sparkles size={14} aria-hidden="true" /> Nyfikenhet tar dig långt!</span>
                <button className="next-button" type="button" onClick={startGame}>Starta quizet <Rocket size={17} aria-hidden="true" /></button>
              </div>
            </>
          )}

          {phase === 'playing' && (
            <>
              <div className="question-content">
                <h2 id="question-title" ref={headingRef} tabIndex={-1}>{turn.question.prompt}</h2>
                <p className="answer-hint">Välj det svar du tror är rätt.</p>
                <div className="answer-grid grid grid-cols-2">
                  {turn.options.map((option, optionIndex) => {
                    const isCorrect = revealed && option === correctAnswer
                    const isWrongChoice = revealed && !wasSkipped && option === chosenAnswer && option !== correctAnswer
                    const answerClass = isCorrect ? 'answer-option is-correct' : isWrongChoice ? 'answer-option is-incorrect' : revealed ? 'answer-option is-dimmed' : 'answer-option'
                    return (
                      <button className={`${answerClass} flex items-center`} type="button" key={`${turn.question.id}-${option}`}
                        onClick={() => dispatch({ type: 'answer', questionId: turn.question.id, option })}
                        disabled={revealed} aria-pressed={chosenAnswer === option}>
                        <span className="answer-letter" aria-hidden="true">{String.fromCharCode(65 + optionIndex)}</span>
                        <span className="answer-text">{option}</span>
                        {isCorrect && <Check className="answer-status" size={19} aria-label="Rätt svar" />}
                        {isWrongChoice && <X className="answer-status" size={19} aria-label="Ditt svar var fel" />}
                      </button>
                    )
                  })}
                </div>
                <div aria-live="polite" aria-atomic="true">
                  {revealed && (
                    <div className={`feedback ${wasSkipped ? 'feedback-skipped' : chosenAnswer === correctAnswer ? 'feedback-correct' : 'feedback-incorrect'}`}>
                      <div className="feedback-heading">
                        <span className="feedback-icon"><Lightbulb size={17} aria-hidden="true" /></span>
                        <span>{wasSkipped ? 'Här är rätt svar!' : chosenAnswer === correctAnswer ? 'Rätt svar!' : 'Fel svar! Du lär dig något nytt.'}</span>
                      </div>
                      <p><strong>Rätt svar: {correctAnswer}.</strong> {turn.question.explanation}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="card-footer flex items-center justify-between">
                <span className="gentle-reminder"><Sparkles size={14} aria-hidden="true" /> Varje fråga är en upptäckt!</span>
                {revealed ? (
                  <button className="next-button" type="button" onClick={() => dispatch({ type: 'next', questionId: turn.question.id })}>
                    {index === QUESTIONS_PER_GAME - 1 ? 'Visa resultat' : 'Nästa fråga'} <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ) : (
                  <button className="skip-button" type="button" onClick={() => dispatch({ type: 'skip', questionId: turn.question.id })}>
                    Visa svaret <SkipForward size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
          )}

          {phase === 'finished' && (
            <>
              <div className="question-content">
                <h2 id="question-title" ref={headingRef} tabIndex={-1}>Ditt resultat</h2>
                <p className="result-score">{score} <span>av {QUESTIONS_PER_GAME} rätt</span></p>
                <p className="round-description">{resultMessage(score)}</p>
                <p className="answer-hint">Spela igen för 10 nya frågor. Rymden har mer att bjuda på!</p>
              </div>
              <div className="card-footer flex items-center justify-between">
                <span className="gentle-reminder"><Sparkles size={14} aria-hidden="true" /> Fortsätt vara nyfiken!</span>
                <button className="next-button" type="button" onClick={startGame}>Spela igen <RotateCcw size={17} aria-hidden="true" /></button>
              </div>
            </>
          )}
        </section>
        <p className="footer-note">Små frågor. Stora upptäckter. <span>Utforska i din egen takt med CAESAR.</span></p>
      </main>
    </div>
  )
}

export default App
