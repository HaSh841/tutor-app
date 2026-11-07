// Decides what kind of lesson a tutor gives: 'math' or 'code'.
// To set it yourself, add  kind: 'math'  or  kind: 'code'  to the tutor in data/tutors.js.
// Otherwise it is guessed from the tutor's subject.
export function kindOf(tutor) {
  if (tutor?.kind === 'math' || tutor?.kind === 'code') return tutor.kind
  return /math|algebra|calculus|geometry|trigonometry|statistic/i.test(tutor?.subject ?? '')
    ? 'math'
    : 'code'
}