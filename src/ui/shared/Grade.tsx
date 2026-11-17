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
