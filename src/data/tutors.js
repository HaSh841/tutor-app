// Every tutor in one place. To add another tutor later, copy one block and change it.
//
// face: how the small round icon is cropped from the character png (no extra file needed)
// card: how the big square selection card is cropped (face only)
//   zoom = how zoomed in (bigger = closer to the face, less body)
//   x / y = which point of the png is shown, in % (y smaller = picture moves DOWN in the card,
//           y bigger = picture moves UP; x smaller = picture moves right, x bigger = picture moves left)
//
// voices: one audio file per line in sessionLines, in the same order.
//   If a tutor has fewer voice files than lines, the missing lines are simply silent.

import { ref, update } from 'firebase/database';
import { db } from './firebase';
import { checkCodename } from './codename';

export const tutors = [
  {
    id: 'eterna',
    name: 'Civilight Eterna',
    persona: 'Theresa',                       // the name the AI uses for itself
    subject: 'Computer Science',
    scope:
      'programming, algorithms, data structures, databases and SQL, web development, ' +
      'operating systems, networking, computer architecture and assembly, software engineering, ' +
      'and other computer science topics',
    image: '/resources/Civilight_Eterna.png',
    face: { zoom: 260, x: 50, y: 6 },
    card: { zoom: 260, x: 50, y: 6 },         // face only on the selection card
    chibi: '/resources/Civilight_Eterna_Sprite.webm',   // set to null if a tutor has no chibi video
    greeting: (codename) => `Hello, ${codename || 'Doctor'}. What would you like to talk about?`,
    // shown on the session screen, one per click. The codename box opens after the LAST line.
    sessionLines: [
      'Doctor, welcome to DWDB.',
      'As you can see, you have no memories of everything.',
      'But, rest assured i will help you regain everything.',
      'I will be right here with you.',
      'Can you tell me your name doctor?',
    ],
    // voice files for the session lines above (same order)
    voices: [
      '/resources/voice/line1.mp3',
      '/resources/voice/line2.mp3',
      '/resources/voice/line3.mp3',
      '/resources/voice/line4.mp3',
      '/resources/voice/line5.mp3',
    ],
    // Tutoring Mode texts
    askPlaceholder: 'Teach me a code...',
    tutoringTag: 'Code',
    emptyCode:
      'Ask me to teach you a piece of code. The raw code and everything you need to know about it will appear here.',
    emptyFlow:
      'The steps the code goes through, from the start until the result, will appear here.',
    codeDesc:
      'the complete raw code as one string, with \\n for new lines, no markdown fences, ideally under 40 lines',
    notesDesc:
      'everything the learner needs to know, such as syntax, instructions and concepts used, mention line numbers when helpful',
    flowDesc: 'in the exact order the code runs, from the start until the result',
  },
  {
    id: 'math',
    name: 'Priestess',                       // KEEP YOUR OWN: her real name
    persona: 'PRTS',                    // KEEP YOUR OWN: the name the AI uses for itself
    subject: 'Mathematics',
    scope:
      'arithmetic, algebra, geometry, trigonometry, calculus, statistics and probability, ' +
      'discrete math, linear algebra, and other mathematics topics',
    image: '/resources/Priestess.png',   // KEEP YOUR OWN: your real png path
    face: { zoom: 400, x: 50, y: 4 },
    card: { zoom: 400, x: 50, y: 4 },         // moved down and zoomed out a little so her whole face fits
    chibi: null,                              // no chibi video yet: use '/resources/your_chibi.webm' later
    greeting: (codename) => `Hello, ${codename || 'Doctor'}. Which math topic shall we work on?`,
    sessionLines: [                           // KEEP YOUR OWN: her lines
      'Doctor, welcome.',
      'Numbers are easy once you see how they fit together.',
      'I will be right here to guide you.',
      'Can you tell me your name doctor?',
    ],
    // her own voice files, in a separate folder so they never mix with Eterna's
    voices: [
      '/resources/voice/prts_line1.mp3',
      '/resources/voice/prts_line2.mp3',
      '/resources/voice/prts_line3.mp3',
      '/resources/voice/prts_line4.mp3',
    ],
    askPlaceholder: 'Teach me a math topic...',
    tutoringTag: 'Solution',
    emptyCode:
      'Ask me to teach you a math topic or solve a problem. The full working and everything you need to know will appear here.',
    emptyFlow:
      'The steps of the solution, from the start until the answer, will appear here.',
    codeDesc:
      'the full worked solution as plain text, one line of working per string line (use \\n between lines), ' +
      'written with simple symbols like x^2, sqrt(), /, * and =, no LaTeX, no markdown fences',
    notesDesc:
      'everything the learner needs to know, such as formulas, rules and concepts used, mention line numbers when helpful',
    flowDesc: 'in the exact order the solution proceeds, from the given problem until the final answer',
  },
]

export const getTutor = (id) => tutors.find((t) => t.id === id) ?? tutors[0]

// remembers which tutor a codename uses, so Load Session brings back the same tutor
const key = (codename) => `tutor:${codename}`

// this device only (used right after a session is loaded)
export function rememberTutorLocally(codename, id) {
  try {
    localStorage.setItem(key(codename), id)
  } catch {
    /* storage not allowed: the first tutor is used next time */
  }
}

// on this device AND in the database, so Load Session also works on another phone or in the app
export function rememberTutor(codename, id) {
  rememberTutorLocally(codename, id)

  if (!db || checkCodename(codename) !== '') return
  try {
    update(ref(db, `sessions/${codename}`), { tutorId: id }).catch(() => {})
  } catch {
    /* the database did not accept the path: the tutor is only kept on this device */
  }
}

export function getSavedTutorId(codename) {
  try {
    return localStorage.getItem(key(codename)) || tutors[0].id
  } catch {
    return tutors[0].id
  }
}