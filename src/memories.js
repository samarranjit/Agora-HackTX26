// The single source for exhibit imagery, study facts, and accepted quiz answers.
// Notes deliberately do not influence this offline demo.
export const SAMPLE_MEMORIES = [
  {
    id: 'mitochondria',
    title: 'The ATP power bean',
    fact: 'Mitochondria produce ATP, the cell’s usable energy.',
    cue: 'Imagine a bright orange bean firing golden energy bolts.',
    shape: 'power-bean',
    color: 0xff793c,
    question: 'What energy-carrying molecule do mitochondria produce?',
    answers: ['ATP', 'adenosine triphosphate', 'adenosine-triphosphate'],
    choices: [{ id: 'atp', label: 'ATP', value: 'ATP' }, { id: 'nucleus', label: 'Nucleus', value: 'nucleus' }, { id: 'protein', label: 'Proteins', value: 'proteins' }],
    hint: 'Picture the golden energy bolts. The answer is a three-letter molecule.',
  },
  {
    id: 'nucleus',
    title: 'The DNA royal vault',
    fact: 'The nucleus stores most of a eukaryotic cell’s DNA.',
    cue: 'A purple royal vault wears a golden crown to guard its genetic treasure.',
    shape: 'royal-vault',
    color: 0xb382ff,
    question: 'Which organelle stores most of a eukaryotic cell’s DNA?',
    answers: ['nucleus', 'the nucleus', 'cell nucleus', 'the cell nucleus'],
    choices: [{ id: 'atp', label: 'ATP', value: 'ATP' }, { id: 'nucleus', label: 'Nucleus', value: 'nucleus' }, { id: 'protein', label: 'Proteins', value: 'proteins' }],
    hint: 'Remember the purple vault that guards the cell’s genetic treasure.',
  },
  {
    id: 'ribosomes',
    title: 'The protein chef',
    fact: 'Ribosomes assemble proteins from amino acids.',
    cue: 'A turquoise chef stacks pink amino-acid beads into a protein kebab.',
    shape: 'protein-chef',
    color: 0x36daca,
    question: 'What do ribosomes assemble from amino acids?',
    answers: ['protein', 'proteins', 'a protein', 'polypeptide', 'polypeptides', 'polypeptide chains'],
    choices: [{ id: 'atp', label: 'ATP', value: 'ATP' }, { id: 'nucleus', label: 'Nucleus', value: 'nucleus' }, { id: 'protein', label: 'Proteins', value: 'proteins' }],
    hint: 'The chef joins amino-acid beads into these larger molecules.',
  },
]

export function normalizeAnswer(answer) {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isCorrectAnswer(memory, answer) {
  return memory.answers.some((accepted) => normalizeAnswer(accepted) === normalizeAnswer(answer))
}
