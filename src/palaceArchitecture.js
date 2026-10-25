// Static, instanced storybook architecture. The keep is scenery, not a playable interior yet.
export function buildPalace(put, { closedEntrance = true } = {}) {
  const band = (x, y, z, r) => put('cylinder', 'trim', [x, y, z], [r, 0.3, r])
  const tower = (x, z, height, radius, roofHeight = 7) => {
    put('tapered', 'stone', [x, height / 2, z], [radius, height, radius])
    put('cylinder', 'shadowStone', [x, 0.8, z], [radius + 0.4, 1.6, radius + 0.4])
    for (const y of [3, height * 0.52, height - 0.3]) band(x, y, z, radius + 0.1)
    put('cone', 'roof', [x, height + roofHeight / 2, z], [radius + 0.8, roofHeight, radius + 0.8])
    put('cone', 'gold', [x, height + roofHeight + 0.5, z], [0.16, 1.7, 0.16])
    put('gem', 'gold', [x, height + roofHeight + 1.25, z], [0.24, 0.4, 0.24])
    for (const y of [5, height * 0.54 + 1, height - 4]) {
      for (const angle of [0, Math.PI / 2, -Math.PI / 2]) {
        const wx = x + Math.sin(angle) * radius * 0.94
        const wz = z + Math.cos(angle) * radius * 0.94
        put('window', 'window', [wx, y, wz], [0.9, 1.25, 1], [0, angle, 0], false)
        put('box', 'gold', [wx, y + 1, wz + (angle === 0 ? 0.03 : 0)], [0.065, 2, 0.07], [0, angle, 0], false)
      }
    }
  }

  // Layered foundations, wings and back keep make the scale legible from ground level.
  put('box', 'foundation', [0, -1.6, -31], [48, 3.2, 26])
  for (const side of [-1, 1]) {
    const x = side * 13.8
    put('box', 'stone', [x, 6.5, -23], [18.5, 13, 9])
    put('box', 'shadowStone', [x, 2, -18.42], [18.7, 0.4, 0.35])
    put('box', 'trim', [x, 12.7, -23], [19, 0.5, 9.5])
    for (const y of [1.3, 3.2, 10.9]) put('box', 'shadowStone', [x, y, -18.47], [18.5, 0.045, 0.08], [0, 0, 0], false)
    for (let i = 0; i < 12; i++) {
      put('box', 'stone', [side * (5.1 + i * 1.5), 13.45, -18.6], [0.85, 1.2, 0.8])
    }
    for (const wx of [7, 11, 15, 19]) {
      put('window', 'window', [side * wx, 5, -18.46], [1.1, 1.6, 1], [0, 0, 0], false)
      put('arch', 'trim', [side * wx, 4.9, -18.4], [0.62, 1.16, 0.2], [0, 0, 0], false)
    }
    tower(side * 21, -21, 18, 3.4, 7)
    tower(side * 11, -33, 29, 3.1, 9)
    tower(side * 6, -20.5, 20.5, 2.5, 7)
    put('banner', 'royal', [side * 7.8, 8.3, -17.95], [1.6, 4.7, 1], [0, 0, 0], false)
    put('box', 'gold', [side * 7.8, 10.7, -17.88], [2, 0.12, 0.15])
    put('gem', 'gold', [side * 7.8, 8.5, -17.8], [0.42, 0.7, 0.08], [0, 0, 0], false)
  }

  // The open gallery above the gate gives a glimpse into the central atrium.
  put('box', 'shadowStone', [0, 13.2, -23], [10, 0.5, 6])
  put('box', 'trim', [0, 20, -23], [10.8, 0.6, 6.8])
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    put('cylinder', 'stone', [x, 16.3, -20.2], [0.28, 6, 0.28])
    put('arch', 'trim', [x, 15.5, -20.2], [1.1, 1.4, 0.45])
  }
  put('roof', 'roof', [0, 23.5, -23], [8, 6, 6], [0, Math.PI / 4, 0])
  put('box', 'stone', [0, 16, -39], [15, 32, 10])
  put('box', 'trim', [0, 31.7, -39], [15.8, 0.6, 10.8])
  put('roof', 'roof', [0, 36, -39], [12, 8, 9], [0, Math.PI / 4, 0])
  tower(0, -39, 37, 2.1, 8)
  for (const y of [16, 22, 27]) for (const x of [-5, -2.5, 2.5, 5]) {
    put('window', 'window', [x, y, -33.96], [0.9, 1.5, 1], [0, 0, 0], false)
  }
  // Closed gate and unmistakable drawbridge, raised above the eight-unit water channel.
  put('window', 'gateDark', [0, 0, -18.05], [7, 5.5, 1])
  put('arch', 'trim', [0, 0, -18], [3.5, 4.1, 0.8])
  if (!closedEntrance) return
  for (let x = -2.8; x <= 2.8; x += 0.7) put('box', 'iron', [x, 4.7, -17.84], [0.12, 9.3, 0.12])
  for (const y of [2, 4, 6, 8]) put('box', 'iron', [0, y, -17.8], [6, 0.12, 0.14])
  const bridgeAngle = -1.05
  const length = 8.3
  const pointOnBridge = (distance) => [0, 0.1 - Math.sin(bridgeAngle) * distance, -18 + Math.cos(bridgeAngle) * distance]
  put('box', 'wood', pointOnBridge(length / 2), [5.8, 0.25, length], [bridgeAngle, 0, 0])
  for (let i = 0; i < 14; i++) put('box', 'woodLight', pointOnBridge(0.3 + i * 0.58), [5.5, 0.29, 0.48], [bridgeAngle, 0, 0])
  for (const side of [-1, 1]) {
    const middle = pointOnBridge(length / 2)
    middle[0] = side * 2.75
    put('box', 'iron', middle, [0.2, 0.34, length], [bridgeAngle, 0, 0])
    const tip = pointOnBridge(length)
    for (let i = 0; i < 22; i++) {
      const t = i / 21
      put('ring', 'iron', [side * 3, tip[1] + (10 - tip[1]) * t, tip[2] + (-18 - tip[2]) * t], [0.12, 0.21, 0.12], [0.7, i % 2 ? Math.PI / 2 : 0, 0], false)
    }
    put('ring', 'gold', [side * 2, tip[1] - 1, tip[2] - 0.3], [0.24, 0.24, 0.24], [0, 0, 0], false)
  }
}
