import type { BotScore } from '../../core/model'
import { useNumber, useT } from '../i18n'

/** one grade form everywhere: letter first, then the score, in mono and the grade color */
export function Grade({ score, className = '' }: { score: BotScore; className?: string }) {
  const t = useT()
  const number = useNumber()
  const value = number(score.score)
  return (
    <span className={'grade grade-' + score.grade + (className && ' ' + className)} role="img" aria-label={t('grade.aria', { grade: score.grade, score: value })}>
      {/* the baseline pair lives inside, so a parent box can center it */}
      <span className="grade-pair"><span className="grade-letter">{score.grade}</span> <span className="grade-score">{value}</span></span>
    </span>
  )
}

/** a grade count, 'A ×7': the letter in the grade color, the count muted; the report and the map grade strip use it */
export function GradeCount({ grade, count }: { grade: BotScore['grade']; count: number }) {
  const number = useNumber()
  return (
    <span className={'grade-count grade-' + grade}>
      {grade} <span className="grade-count-n">×{number(count)}</span>
    </span>
  )
}

/** a sentence with figures, '30 of 43 shown': the words stay in the UI face, each figure is a mono .fig */
export function Figures({ text }: { text: string }) {
  return <>{text.split(/([−+-]?\d[\d.,]*)/).map((part, i) => (i % 2 ? <span key={i} className="fig">{part}</span> : part))}</>
}
