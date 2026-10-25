// Prototype content lives here so the fifteen questions can be replaced together.
export const FILLER = Object.freeze({ question: '*filler question*', answer: 'answer', explanation: 'filler explanation' })
export const QUESTIONS_PER_COLLECTIBLE = 3
const definitions = [
  { id: 'trident', name: "King Triton's Trident", x: -12, z: 29, landmark: 'Follow the blue stones toward the secluded pond.', color: 0x6fddd7 },
  { id: 'cloak', name: "Little Red Riding Hood's Cloak", x: 12, z: 20, landmark: 'A crimson ribbon marks a gap in the eastern trees.', color: 0xde6676 },
  { id: 'slipper', name: "Cinderella's Glass Slipper", x: -13, z: 9, landmark: 'Look for a little stone arch west of the trail.', color: 0xa7deef },
  { id: 'eggs', name: "Humpty Dumpty's Eggs", x: 13, z: -3, landmark: 'A sheltered nest rests beyond the golden birches.', color: 0xf3d998 },
  { id: 'potion', name: "Alice in Wonderland's Potion", x: -10, z: -14, landmark: 'Violet mushrooms lead to a curious clearing.', color: 0xbd92eb },
]
export const FOREST_COLLECTIBLES = Object.freeze(definitions.map((definition) => Object.freeze({
  ...definition,
  questions: Object.freeze(Array.from({ length: QUESTIONS_PER_COLLECTIBLE }, (_, index) => Object.freeze({
    id: `${definition.id}-question-${index + 1}`, question: FILLER.question,
    answers: Object.freeze([FILLER.answer]), explanation: FILLER.explanation,
  }))),
})))
// The final recall reuses three studied questions; it adds no collectible or XP reward.
export const FOREST_DRAGON = Object.freeze({ id: 'dragon', name: 'The Storykeeper Dragon', questions: FOREST_COLLECTIBLES[0].questions })
export const getForestTarget = (id) => id === FOREST_DRAGON.id ? FOREST_DRAGON : FOREST_COLLECTIBLES.find((item) => item.id === id)
