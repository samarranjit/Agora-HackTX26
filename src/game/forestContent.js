// Static scenery identities only. Questions and outcomes belong to the server.
const definitions = [
  { id: 'trident', name: "King Triton's Trident", x: -12, z: 29, landmark: 'Follow the blue stones toward the secluded pond.', color: 0x6fddd7 },
  { id: 'cloak', name: "Little Red Riding Hood's Cloak", x: 12, z: 20, landmark: 'A crimson ribbon marks a gap in the trees.', color: 0xde6676 },
  { id: 'slipper', name: "Cinderella's Glass Slipper", x: -13, z: 9, landmark: 'Look for a little stone arch off the trail.', color: 0xa7deef },
  { id: 'eggs', name: "Humpty Dumpty's Eggs", x: 13, z: -3, landmark: 'A tucked-away nest rests under a wooden shelter.', color: 0xf3d998 },
  { id: 'potion', name: "Alice in Wonderland's Potion", x: -10, z: -14, landmark: 'Violet mushrooms lead to a curious clearing.', color: 0xbd92eb },
]
export const FOREST_COLLECTIBLES = Object.freeze(definitions.map((item) => Object.freeze({ ...item, kind: 'collectible' })))
export const FOREST_ENEMIES = Object.freeze([{ id: 'goblin', name: 'Forest Goblin', kind: 'combat' }, { id: 'wolf', name: 'The Big Bad Wolf', kind: 'combat' }].map(Object.freeze))
export const FOREST_DRAGON = Object.freeze({ id: 'dragon', name: 'The Storykeeper Dragon', kind: 'combat' })
export const getForestTarget = (id) => [FOREST_DRAGON, ...FOREST_ENEMIES, ...FOREST_COLLECTIBLES].find((item) => item.id === id)
