import * as THREE from 'three'

// One bounded particle pool serves every collectible, the bridge, and the dragon.
export function createMagicEffects(scene, capacity = 128) {
  const positions = new Float32Array(capacity * 3), colors = new Float32Array(capacity * 3)
  const velocity = new Float32Array(capacity * 3), tint = new Float32Array(capacity * 3)
  const age = new Float32Array(capacity), life = new Float32Array(capacity)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
  const pixels = new Uint8Array(16 * 16 * 4)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const offset = (y * 16 + x) * 4, alpha = Math.max(0, 1 - Math.hypot(x - 7.5, y - 7.5) / 7.5)
    pixels.set([255, 255, 255, Math.round(alpha * alpha * 255)], offset)
  }
  const texture = new THREE.DataTexture(pixels, 16, 16); texture.needsUpdate = true
  const material = new THREE.PointsMaterial({ size: 0.18, map: texture, color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; points.name = 'Storywood sparkles'; scene.add(points)
  let cursor = 0, disposed = false, seed = 19
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  return {
    burst(position, { count = 22, color = 0xffd994, gentle = false, reducedMotion = false, flame = false } = {}) {
      if (disposed) return
      const c = new THREE.Color(color)
      const ember = new THREE.Color(0xff2d00)
      const total = Math.min(capacity, reducedMotion ? flame ? 8 : 4 : count)
      for (let n = 0; n < total; n++) {
        const i = cursor++ % capacity, offset = i * 3, angle = random() * Math.PI * 2
        const heat = flame ? 0.15 + random() * 0.85 : 1
        const shade = flame ? ember.clone().lerp(c, heat) : c
        const speed = reducedMotion ? 0 : flame ? 0.35 + random() * 0.7 : gentle ? 0.09 : 0.5 + random() * 0.65
        const spread = flame ? 0.55 : 0.65
        positions[offset] = position.x + (random() - 0.5) * spread
        positions[offset + 1] = position.y + random() * (flame ? 0.7 : 0.35)
        positions[offset + 2] = position.z + (random() - 0.5) * spread
        velocity[offset] = Math.cos(angle) * (flame ? speed * 0.35 : speed)
        velocity[offset + 1] = reducedMotion ? 0 : flame ? 1.15 + random() * 1.8 : gentle ? 0.08 : 0.4 + random() * 0.6
        velocity[offset + 2] = Math.sin(angle) * (flame ? speed * 0.35 : speed)
        tint.set([shade.r, shade.g, shade.b], offset)
        age[i] = 0
        life[i] = reducedMotion ? 0.22 : flame ? 0.55 + random() * 0.55 : gentle ? 5 : 0.65 + random() * 0.2
      }
    },
    update(dt, reducedMotion = false) {
      if (disposed) return
      for (let i = 0; i < capacity; i++) {
        const offset = i * 3
        if (life[i] === 0) continue
        age[i] += dt
        const fade = Math.max(0, 1 - age[i] / life[i])
        if (!reducedMotion) for (let axis = 0; axis < 3; axis++) positions[offset + axis] += velocity[offset + axis] * dt
        for (let axis = 0; axis < 3; axis++) colors[offset + axis] = tint[offset + axis] * fade * fade
        if (!fade) life[i] = 0
      }
      geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true
    },
    dispose() { if (!disposed) { disposed = true; points.removeFromParent(); geometry.dispose(); material.dispose(); texture.dispose() } },
  }
}
