import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// The Storykeeper Dragon: a long, lean, red-orange-and-white beast. Fixed parts are
// merged into a few vertex-coloured meshes. The neck, tail, wings and their
// membranes are lofted shapes whose vertices are re-laid along animated bone paths.
// Units are local; the hall scales the whole dragon. +z is forward, +y is up.

const { clamp } = THREE.MathUtils
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const hex = (value) => new THREE.Color(value)

// Red on the back, orange on the flanks, white on the belly, horns, teeth and flame.
const PAL = {
  deepRed: hex(0x7d0a0c), red: hex(0xc4180d), scarlet: hex(0xe22e16), orange: hex(0xff6a1a), amber: hex(0xff9a32),
  gold: hex(0xffc766), cream: hex(0xffe6c8), white: hex(0xfff8ee), soot: hex(0x2c0a07),
}

function ramp(stops, x, out) {
  if (x <= stops[0][0]) return out.copy(stops[0][1])
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) return out.copy(stops[i - 1][1]).lerp(stops[i][1], (x - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]))
  }
  return out.copy(stops[stops.length - 1][1])
}
// v runs from -1 (belly) to +1 (back).
const SKIN = [[-1, PAL.white], [-0.68, PAL.cream], [-0.36, PAL.gold], [-0.08, PAL.orange], [0.3, PAL.orange], [0.62, PAL.scarlet], [0.9, PAL.red], [1, PAL.red]]
const skinColor = (u, v, out) => {
  ramp(SKIN, v, out)
  // Soft scale bands and flame-lick stripes along the flank.
  const band = 0.5 + 0.5 * Math.sin(u * 190)
  const lick = smooth(0.82, 1, Math.sin(u * 46 + v * 3.1)) * smooth(-0.1, 0.5, v) * (1 - smooth(0.6, 0.95, v))
  return out.multiplyScalar(0.93 + 0.07 * band).lerp(PAL.amber, lick * 0.55)
}

// ---------- Merged static parts ----------

function bake(source, matrix, colorOf) {
  const g = source.index ? source.toNonIndexed() : source.clone()
  g.deleteAttribute('uv')
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) { colorOf(pos.getX(i), pos.getY(i), pos.getZ(i), c); colors.set([c.r, c.g, c.b], i * 3) }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.applyMatrix4(matrix)
  return g
}

function createPart() {
  const geometries = [], matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), euler = new THREE.Euler()
  const up = V(0, 1, 0)
  return {
    orb(position, scale, top, bottom = top, rotation = [0, 0, 0], detail = 1) {
      const source = new THREE.SphereGeometry(1, Math.round(26 * detail), Math.round(18 * detail))
      matrix.compose(V(...position), quat.setFromEuler(euler.set(...rotation)), V(...scale))
      geometries.push(bake(source, matrix, (x, y, z, out) => out.copy(bottom).lerp(top, (y + 1) / 2)))
      source.dispose()
    },
    // A cone from `from` along `dir`, base colour c0 and tip colour c1.
    cone(from, dir, length, radius, c0, c1 = c0, sides = 10) {
      const source = new THREE.ConeGeometry(1, 1, sides, 2)
      const d = dir.clone().normalize()
      quat.setFromUnitVectors(up, d)
      matrix.compose(from.clone().addScaledVector(d, length / 2), quat, V(radius, length, radius))
      geometries.push(bake(source, matrix, (x, y, z, out) => out.copy(c0).lerp(c1, y + 0.5)))
      source.dispose()
    },
    add(geometry) { geometries.push(geometry.index ? geometry.toNonIndexed() : geometry) },
    build(material, name) {
      const merged = mergeGeometries(geometries, false)
      merged.computeVertexNormals()
      geometries.forEach((g) => g.dispose())
      const mesh = new THREE.Mesh(merged, material)
      mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true
      return mesh
    },
  }
}

// ---------- Lofted tubes ----------

// A tube of elliptical rings along a path, with optional spines. `shape(points)` lays
// the vertices along a new path, so the same tube serves fixed and bending parts.
function createTube({ rings, sides, rx, ry, color, spikes = [] }) {
  const ringTotal = rings + 1, body = ringTotal * sides, total = body + spikes.length * 4
  const positions = new Float32Array(total * 3), colors = new Float32Array(total * 3), normals = new Float32Array(total * 3)
  const index = []
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * sides + s, b = r * sides + (s + 1) % sides, c = (r + 1) * sides + s, d = (r + 1) * sides + (s + 1) % sides
      index.push(a, c, b, b, c, d)
    }
  }
  const tint = new THREE.Color()
  for (let r = 0; r < ringTotal; r++) {
    for (let s = 0; s < sides; s++) { color(r / rings, Math.cos(s / sides * Math.PI * 2), tint); colors.set([tint.r, tint.g, tint.b], (r * sides + s) * 3) }
  }
  spikes.forEach((sp, k) => {
    const first = body + k * 4
    index.push(first, first + 1, first + 2, first, first + 2, first + 3, first, first + 3, first + 1)
    colors.set([sp.tip.r, sp.tip.g, sp.tip.b], first * 3)
    for (let n = 1; n < 4; n++) colors.set([sp.base.r, sp.base.g, sp.base.b], (first + n) * 3)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setIndex(index)
  const frames = Array.from({ length: ringTotal }, () => ({ P: V(), T: V(), N: V(), B: V() }))
  const q = new THREE.Quaternion(), dorsal = V(0, 1, 0), axis = V(), apex = V(), point = V()
  const put = (i, v) => positions.set([v.x, v.y, v.z], i * 3)
  return {
    geometry, frames,
    shape(points, withNormals = true) {
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
      for (let r = 0; r < ringTotal; r++) {
        const f = frames[r], u = r / rings
        curve.getPoint(u, f.P); curve.getTangent(u, f.T)
        if (r === 0) f.N.copy(dorsal).addScaledVector(f.T, -dorsal.dot(f.T))
        else { q.setFromUnitVectors(frames[r - 1].T, f.T); f.N.copy(frames[r - 1].N).applyQuaternion(q) }
        f.N.addScaledVector(f.T, -f.N.dot(f.T)).normalize()
        f.B.crossVectors(f.T, f.N)
        for (let s = 0; s < sides; s++) {
          const angle = s / sides * Math.PI * 2, a = Math.cos(angle) * ry[r], b = Math.sin(angle) * rx[r]
          put(r * sides + s, point.copy(f.P).addScaledVector(f.N, a).addScaledVector(f.B, b))
        }
      }
      spikes.forEach((sp, k) => {
        const f = frames[sp.ring], first = body + k * 4
        const w = sp.width, h = sp.height
        if (sp.axis === 'T') {
          // A claw continuing the tube: the apex ahead, the base ring round the end.
          put(first, point.copy(f.P).addScaledVector(f.T, h))
          put(first + 1, point.copy(f.P).addScaledVector(f.N, w))
          put(first + 2, point.copy(f.P).addScaledVector(f.N, -w * 0.5).addScaledVector(f.B, w * 0.87))
          put(first + 3, point.copy(f.P).addScaledVector(f.N, -w * 0.5).addScaledVector(f.B, -w * 0.87))
          return
        }
        const sign = sp.axis.startsWith('-') ? -1 : 1, onB = sp.axis.endsWith('B')
        axis.copy(onB ? f.B : f.N).multiplyScalar(sign)
        const radial = (onB ? rx : ry)[sp.ring] * 0.9
        const centre = point.copy(f.P).addScaledVector(axis, radial).clone()
        put(first, apex.copy(centre).addScaledVector(axis, h).addScaledVector(f.T, -h * sp.sweep))
        const side = onB ? f.N : f.B
        put(first + 1, point.copy(centre).addScaledVector(side, w).addScaledVector(f.T, w * 0.7))
        put(first + 2, point.copy(centre).addScaledVector(side, -w).addScaledVector(f.T, w * 0.7))
        put(first + 3, point.copy(centre).addScaledVector(f.T, -w * 1.2))
      })
      geometry.attributes.position.needsUpdate = true
      if (withNormals) geometry.computeVertexNormals()
    },
  }
}

const profile = (rings, fn) => Float32Array.from({ length: rings + 1 }, (_, i) => fn(i / rings))
const bump = (x, centre, width) => Math.exp(-(((x - centre) / width) ** 2))
const spike = (ring, axis, height, width, sweep, base, tip = PAL.white) => ({ ring, axis, height, width, sweep, base, tip })

// A bone-and-muscle limb: a fixed tube along a path.
function limb(points, rxFn, ryFn, rings = 26, sides = 14) {
  const tube = createTube({
    rings, sides, rx: profile(rings, rxFn), ry: profile(rings, ryFn),
    color: (u, v, out) => ramp([[0, PAL.scarlet], [0.3, PAL.orange], [0.75, PAL.gold], [1, PAL.cream]], u, out).lerp(PAL.red, Math.max(0, v) * 0.25 * (1 - u)),
  })
  tube.shape(points)
  return tube.geometry
}

// ---------- The dragon ----------

const FLAP_PERIOD = 5, FLAP_START = 0.35, FLAP_LENGTH = 2.6, FLAP_BEATS = 3
const FIRE_PERIOD = 11, FIRE_START = 7.3
const NECK_PITCH = [0.5, 1.0, 1.25, 1.2, 0.95, 0.55, 0.1, -0.3, -0.5]
const NECK_SEGMENT = 0.66
const NECK_WEIGHT_PITCH = [0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.17, 0.14, 0.14]
const NECK_WEIGHT_YAW = [0.04, 0.07, 0.1, 0.12, 0.14, 0.16, 0.16, 0.11, 0.1]
const TAIL_PITCH = [-0.25, -0.4, -0.45, -0.38, -0.26, -0.1, 0.06, 0.2, 0.3, 0.38]
const TAIL_SEGMENT = 0.9
const torsoY = (s) => 2.0 + 0.3 * Math.sin(Math.PI * s) + 0.34 * s
const HIP = V(0, torsoY(0), -3), SHOULDER = V(0, torsoY(1), 3)

// Wing bones in the shoulder's frame (+x outward). Fixed arm, bending forearm and fingers.
const ELBOW = V(2.8, 1.0, -0.5), FOREARM = V(3.1, 0.95, -1.05)
const FINGERS = [V(3.3, 1.2, 0.5), V(3.7, -0.15, -2.7), V(2.6, -0.9, -4.6), V(0.8, -1.3, -5.6)]
const WING_MOUNT = V(0.5, 3.0, 1.7), WING_HIP = V(0.25, -0.7, -4.7)

function flapState(time) {
  const x = ((time % FLAP_PERIOD) - FLAP_START) / FLAP_LENGTH
  if (x <= 0 || x >= 1) return { env: 0, wave: 0 }
  const phase = Math.PI * 2 * FLAP_BEATS * x
  return { env: Math.sin(Math.PI * x), wave: -Math.cos(phase) + 0.18 * Math.sin(phase * 2) }
}

function fireState(time) {
  const q = (time % FIRE_PERIOD) - FIRE_START
  if (time <= 0 || q <= 0 || q >= 3) return { windup: 0, heat: 0 }
  return { windup: smooth(0, 0.7, q) * (1 - smooth(2.3, 3, q)), heat: smooth(0.7, 1.0, q) * (1 - smooth(2.1, 2.45, q)) }
}

// Emission that follows the vertex colours: parts glow in their own red, orange or white.
function glowByColor(material, key) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;')
  }
  material.customProgramCacheKey = () => key
}

const rotateZ = (v, angle, out = V()) => out.set(v.x * Math.cos(angle) - v.y * Math.sin(angle), v.x * Math.sin(angle) + v.y * Math.cos(angle), v.z)

function createWing(side, skin, membraneMaterial) {
  const group = new THREE.Group()
  group.position.set(WING_MOUNT.x * side, WING_MOUNT.y, WING_MOUNT.z)
  const boneColor = (u, v, out) => ramp([[-1, PAL.cream], [0, PAL.orange], [1, PAL.red]], v, out).lerp(PAL.white, u * u * 0.35)
  const bone = (rings, sides, r0, r1, claw) => createTube({
    rings, sides, rx: profile(rings, (u) => r0 + (r1 - r0) * u), ry: profile(rings, (u) => r0 + (r1 - r0) * u), color: boneColor,
    spikes: claw ? [{ ring: rings, axis: 'T', height: claw, width: r1 + 0.04, sweep: 0, base: PAL.cream, tip: PAL.white }] : [],
  })
  const arm = bone(30, 12, 0.34, 0.2)
  const spur = { ring: 30, axis: 'N', height: 0.55, width: 0.1, sweep: -0.3, base: PAL.cream, tip: PAL.white }
  const forearmTube = createTube({ rings: 30, sides: 12, rx: profile(30, (u) => 0.2 - 0.07 * u), ry: profile(30, (u) => 0.2 - 0.07 * u), color: boneColor, spikes: [spur] })
  const fingers = FINGERS.map((_, i) => bone(26, 9, 0.13 - i * 0.012, 0.02, i === 0 ? 0.55 : 0.34))
  const members = [arm, forearmTube, ...fingers]
  members.forEach((tube) => {
    const mesh = new THREE.Mesh(tube.geometry, skin)
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true
    group.add(mesh)
  })

  // The membrane: three fans between the fingers plus the arm panel along the body.
  const COLS_FAN = 26, COLS_ARM = 38, ROWS = 18
  const panels = [{ cols: COLS_FAN, a: 0, b: 1 }, { cols: COLS_FAN, a: 1, b: 2 }, { cols: COLS_FAN, a: 2, b: 3 }, { cols: COLS_ARM, arm: true }]
  let vertexTotal = 0
  panels.forEach((p) => { p.offset = vertexTotal; vertexTotal += (p.cols + 1) * (ROWS + 1) })
  const positions = new Float32Array(vertexTotal * 3), colors = new Float32Array(vertexTotal * 3), index = []
  const tint = new THREE.Color()
  panels.forEach((p) => {
    for (let c = 0; c <= p.cols; c++) {
      for (let r = 0; r <= ROWS; r++) {
        const v = r / ROWS, i = p.offset + c * (ROWS + 1) + r
        ramp([[0, PAL.red], [0.18, PAL.scarlet], [0.4, PAL.orange], [0.62, PAL.amber], [0.82, PAL.gold], [0.94, PAL.cream], [1, PAL.white]], p.arm ? 0.28 + v * 0.72 : v, tint)
        const beside = Math.min(c, p.cols - c) / p.cols
        tint.multiplyScalar(0.94 + 0.06 * Math.sin(c * 1.7 + r)).lerp(PAL.deepRed, (1 - smooth(0, 0.07, beside)) * 0.5 * (1 - v * 0.6))
        colors.set([tint.r, tint.g, tint.b], i * 3)
        if (c < p.cols && r < ROWS) { const a = i, b = i + ROWS + 1, d = i + 1, e = i + ROWS + 2; index.push(a, b, d, d, b, e) }
      }
    }
  })
  const membraneGeometry = new THREE.BufferGeometry()
  membraneGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  membraneGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  membraneGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexTotal * 3), 3))
  membraneGeometry.setIndex(index)
  const membrane = new THREE.Mesh(membraneGeometry, membraneMaterial)
  membrane.frustumCulled = false; membrane.castShadow = true; membrane.receiveShadow = true; membrane.name = 'dragon-wing-membrane'
  group.add(membrane)

  // Joints are worked out on the +x side; `mirror` moves them to this wing's own side.
  const joints = { E: V(), W: V(), tips: FINGERS.map(() => V()), mids: FINGERS.map(() => V()) }
  const place = (i, x, y, z) => positions.set([x, y, z], i * 3)
  const mirror = (v, out = V()) => out.set(v.x * side, v.y, v.z)
  const spot = V(), edge = V(), root = V(), scratch = V(), lift = V(0, 0.2, 0)
  const alongArm = (t, out) => (t < 0.5 ? out.lerpVectors(V(), joints.E, t * 2) : out.lerpVectors(joints.E, joints.W, t * 2 - 1))

  return {
    group, joints,
    // The shoulder lifts the whole wing; the elbow and wrist let the outer wing trail behind it.
    pose({ shoulder, elbow, wrist, flutter, time, normals }) {
      group.rotation.z = shoulder * side
      group.rotation.y = -0.08 * side
      joints.E.copy(ELBOW)
      joints.W.copy(ELBOW).add(rotateZ(FOREARM, elbow, scratch))
      FINGERS.forEach((vec, i) => {
        rotateZ(vec, elbow + wrist * (0.5 + 0.18 * i), scratch)
        joints.tips[i].copy(joints.W).add(scratch)
        joints.mids[i].copy(joints.W).addScaledVector(scratch, 0.5)
        joints.mids[i].y += 0.28 + i * 0.05
      })
      arm.shape([V(), mirror(joints.E).multiplyScalar(0.5).add(V(0, 0.18, 0)), mirror(joints.E)], normals)
      forearmTube.shape([mirror(joints.E), mirror(joints.E).add(mirror(joints.W)).multiplyScalar(0.5).add(lift), mirror(joints.W)], normals)
      fingers.forEach((tube, i) => tube.shape([mirror(joints.W), mirror(joints.mids[i]), mirror(joints.tips[i])], normals))

      panels.forEach((p) => {
        for (let c = 0; c <= p.cols; c++) {
          const u = c / p.cols
          if (p.arm) {
            // Body panel: leading edge along the arm, trailing edge from the last finger to the hip.
            mirror(alongArm(u, root), root)
            mirror(edge.lerpVectors(WING_HIP, joints.tips[3], u), edge)
            edge.y -= Math.sin(u * Math.PI) * 0.25
          } else {
            // Fan between two fingers, with a scalloped trailing edge.
            mirror(joints.W, root)
            edge.lerpVectors(joints.tips[p.a], joints.tips[p.b], u)
            edge.addScaledVector(scratch.copy(joints.W).sub(edge), 0.2 * Math.sin(u * Math.PI))
            mirror(edge, edge)
          }
          for (let r = 0; r <= ROWS; r++) {
            const v = r / ROWS
            spot.lerpVectors(root, edge, v)
            spot.y += Math.sin(v * Math.PI) * 0.18 + Math.sin(time * 7 - v * 4 + u * 3) * 0.07 * v * flutter
            spot.z += Math.sin(time * 5 - v * 3 + u * 5) * 0.05 * v * flutter
            place(p.offset + c * (ROWS + 1) + r, spot.x, spot.y, spot.z)
          }
        }
      })
      membraneGeometry.attributes.position.needsUpdate = true
      if (normals) membraneGeometry.computeVertexNormals()
    },
  }
}

export function createStoryDragon() {
  const root = new THREE.Group()
  root.name = 'Storykeeper Dragon'
  const rig = new THREE.Group(); root.add(rig)

  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.58, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.22 })
  const membraneMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true, roughness: 0.74, emissive: 0xffffff, emissiveIntensity: 0.55 })
  glowByColor(skin, 'dragon-skin-glow')
  glowByColor(membraneMaterial, 'dragon-membrane-glow')
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffb030, emissive: 0xff7410, emissiveIntensity: 2.6, flatShading: true })
  const slitMaterial = new THREE.MeshStandardMaterial({ color: 0x120403, flatShading: true, roughness: 0.4 })
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x7a1208, emissive: 0xc02c08, emissiveIntensity: 0.9, flatShading: true, side: THREE.DoubleSide })
  const flameMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xd8200c, emissive: 0xff2d00, emissiveIntensity: 1.5, transparent: true, opacity: 0.6, roughness: 0.4, flatShading: true, depthWrite: false }),
    new THREE.MeshStandardMaterial({ color: 0xff8a24, emissive: 0xff6a00, emissiveIntensity: 2, transparent: true, opacity: 0.72, roughness: 0.3, flatShading: true, depthWrite: false }),
    new THREE.MeshStandardMaterial({ color: 0xfff6e2, emissive: 0xffe9b0, emissiveIntensity: 2.6, transparent: true, opacity: 0.85, roughness: 0.25, flatShading: true, depthWrite: false }),
  ]
  root.userData.ownedMaterials = [skin, membraneMaterial, eyeMaterial, slitMaterial, mouthMaterial, ...flameMaterials]

  // --- Torso: slim, deep-chested and long, with a row of dorsal plates ---
  const TORSO_RINGS = 150, TORSO_SIDES = 36
  const torsoPoints = Array.from({ length: 13 }, (_, i) => { const s = i / 12; return V(0, torsoY(s), HIP.z + (SHOULDER.z - HIP.z) * s) })
  const torsoSpikes = []
  for (let i = 4; i < TORSO_RINGS - 2; i += 9) {
    const s = i / TORSO_RINGS, big = 0.2 + 0.28 * bump(s, 0.78, 0.35) + 0.1 * bump(s, 0.15, 0.2)
    torsoSpikes.push(spike(i, 'N', big, 0.13 + big * 0.18, 0.55, i % 18 < 9 ? PAL.orange : PAL.scarlet))
  }
  const torso = createTube({
    rings: TORSO_RINGS, sides: TORSO_SIDES,
    rx: profile(TORSO_RINGS, (s) => 0.42 + 0.17 * bump(s, 0.8, 0.2) + 0.12 * bump(s, 0.14, 0.14) - 0.05 * bump(s, 0.46, 0.2)),
    ry: profile(TORSO_RINGS, (s) => 0.52 + 0.34 * bump(s, 0.8, 0.18) + 0.12 * bump(s, 0.14, 0.14) - 0.06 * bump(s, 0.46, 0.2)),
    color: skinColor, spikes: torsoSpikes,
  })
  torso.shape(torsoPoints)

  const torsoPart = createPart()
  torsoPart.add(torso.geometry)
  rig.add(torsoPart.build(skin, 'dragon-torso'))
  const body = createPart()
  // Legs: heavy thighs and shoulders that grow out of the torso, tapering to clawed feet.
  for (const side of [-1, 1]) {
    // Fore legs: shoulder, elbow, wrist, paw. Hind legs: thigh, knee, hock, foot.
    const front = [V(side * 0.14, 2.3, 2.5), V(side * 0.72, 1.4, 2.0), V(side * 0.64, 0.66, 2.7), V(side * 0.6, 0.12, 3.05)]
    const hind = [V(side * 0.16, 2.1, -2.4), V(side * 0.84, 1.25, -1.6), V(side * 0.66, 0.55, -2.75), V(side * 0.6, 0.12, -2.25)]
    for (const [path, z0, toe, heavy] of [[front, 3.0, 0.42, 0.0], [hind, -2.25, 0.44, 0.08]]) {
      body.add(limb(path, (u) => 0.1 + (0.26 + heavy) * (1 - u) ** 1.6, (u) => 0.12 + (0.34 + heavy) * (1 - u) ** 1.6, 40, 20))
      body.orb([side * 0.6, 0.1, z0 + 0.1], [0.22, 0.1, 0.34], PAL.orange, PAL.red)
      for (const t of [-1, 0, 1]) {
        const base = V(side * 0.6 + t * 0.15, 0.08, z0 + 0.3)
        body.cone(base, V(t * 0.18, -0.05, 1), toe, 0.075, PAL.cream, PAL.white, 8)
        body.cone(base.clone().addScaledVector(V(t * 0.18, -0.05, 1).normalize(), toe * 0.85), V(t * 0.18, -0.3, 1), 0.22, 0.05, PAL.white, PAL.soot, 8)
      }
    }
  }
  rig.add(body.build(skin, 'dragon-legs'))

  // --- Neck: a long bending S with white-tipped spines ---
  const NECK_RINGS = 110, NECK_SIDES = 28
  const neckSpikes = []
  for (let i = 3; i < NECK_RINGS - 4; i += 7) neckSpikes.push(spike(i, 'N', 0.34 - 0.2 * (i / NECK_RINGS), 0.11, 0.6, PAL.orange))
  const neck = createTube({
    rings: NECK_RINGS, sides: NECK_SIDES,
    rx: profile(NECK_RINGS, (u) => 0.46 - 0.27 * u ** 0.85), ry: profile(NECK_RINGS, (u) => 0.58 - 0.34 * u ** 0.8),
    color: skinColor, spikes: neckSpikes,
  })
  const neckMesh = new THREE.Mesh(neck.geometry, skin)
  neckMesh.frustumCulled = false; neckMesh.castShadow = true; neckMesh.receiveShadow = true; neckMesh.name = 'dragon-neck'
  rig.add(neckMesh)

  // --- Tail: long, lashing, ending in a white-and-red spade ---
  const TAIL_RINGS = 110, TAIL_SIDES = 22
  const tailSpikes = []
  for (let i = 5; i < TAIL_RINGS - 10; i += 8) tailSpikes.push(spike(i, 'N', 0.34 * (1 - i / TAIL_RINGS) + 0.1, 0.1, -0.5, PAL.scarlet))
  tailSpikes.push(spike(TAIL_RINGS, 'N', 0.8, 0.2, -0.2, PAL.red), spike(TAIL_RINGS, '-N', 0.5, 0.16, -0.2, PAL.red), spike(TAIL_RINGS - 2, 'B', 0.6, 0.14, -0.2, PAL.orange), spike(TAIL_RINGS - 2, '-B', 0.6, 0.14, -0.2, PAL.orange))
  tailSpikes.push({ ring: TAIL_RINGS, axis: 'T', height: 1.1, width: 0.14, sweep: 0, base: PAL.orange, tip: PAL.white })
  const tail = createTube({
    rings: TAIL_RINGS, sides: TAIL_SIDES,
    rx: profile(TAIL_RINGS, (u) => 0.4 * (1 - u) ** 1.2 + 0.025), ry: profile(TAIL_RINGS, (u) => 0.5 * (1 - u) ** 1.2 + 0.03),
    color: skinColor, spikes: tailSpikes,
  })
  const tailMesh = new THREE.Mesh(tail.geometry, skin)
  tailMesh.frustumCulled = false; tailMesh.castShadow = true; tailMesh.receiveShadow = true; tailMesh.name = 'dragon-tail'
  rig.add(tailMesh)

  // --- Wings ---
  const wings = [createWing(-1, skin, membraneMaterial), createWing(1, skin, membraneMaterial)]
  wings.forEach((w) => rig.add(w.group))

  // --- Head: angular, brow-ridged, with long swept-back ears and a hinged jaw ---
  const head = new THREE.Group(); head.name = 'dragon-head'; head.scale.setScalar(1.3); rig.add(head)
  const skull = createPart()
  const HEAD_RINGS = 80
  const headWidth = (u) => 0.13 + 0.17 * (1 - u) ** 1.2 + 0.17 * bump(u, 0.15, 0.14)
  const headHeight = (u) => 0.1 + 0.15 * (1 - u) ** 1.2 + 0.2 * bump(u, 0.17, 0.15)
  const skullTube = createTube({
    rings: HEAD_RINGS, sides: 28, rx: profile(HEAD_RINGS, headWidth), ry: profile(HEAD_RINGS, headHeight),
    color: (u, v, out) => ramp([[-1, PAL.cream], [-0.3, PAL.orange], [0.35, PAL.scarlet], [1, PAL.red]], v, out).lerp(PAL.orange, smooth(0.55, 1, u) * 0.35),
    spikes: [0.3, 0.42, 0.54, 0.66, 0.78].map((u, i) => spike(Math.round(u * HEAD_RINGS), 'N', 0.2 - i * 0.025, 0.07 - i * 0.008, 0.6, PAL.orange)),
  })
  skullTube.shape([V(0, 0.02, -0.3), V(0, 0.02, 0.6), V(0, -0.02, 1.35), V(0, -0.05, 2.0)])
  skull.add(skullTube.geometry)
  for (const side of [-1, 1]) {
    // Heavy brow horns, jaw-hinge spurs and nostrils.
    skull.cone(V(side * 0.18, 0.2, 0.5), V(side * 0.7, 0.4, -0.9), 0.62, 0.09, PAL.scarlet, PAL.white)
    skull.cone(V(side * 0.26, 0.04, 0.12), V(side * 1.2, 0.35, -0.9), 0.62, 0.085, PAL.orange, PAL.white)
    skull.cone(V(side * 0.3, -0.04, 0.05), V(side * 1.4, -0.1, -1), 0.52, 0.075, PAL.orange, PAL.white)
    skull.cone(V(side * 0.3, -0.12, 0.0), V(side * 1.5, -0.5, -0.8), 0.44, 0.065, PAL.scarlet, PAL.white)
    skull.orb([side * 0.07, 0.06, 1.95], [0.05, 0.04, 0.06], PAL.soot, PAL.soot)
    for (let i = 0; i < 6; i++) {
      const z = 0.75 + i * 0.2, long = i === 4 ? 0.36 : 0.17 + (i % 2) * 0.05
      skull.cone(V(side * (0.2 - i * 0.018), -0.16, z), V(0, -1, 0.1), long, 0.036, PAL.cream, PAL.white, 8)
    }
  }
  const earGeometry = (side, inner) => {
    const rings = 44
    const tube = createTube({
      rings, sides: 14,
      rx: profile(rings, (u) => (inner ? 0.075 : 0.14) * (1 - u) ** 0.9 + 0.012), ry: profile(rings, (u) => (inner ? 0.075 : 0.14) * (1 - u) ** 0.9 + 0.012),
      color: (u, v, out) => ramp([[0, PAL.deepRed], [0.35, PAL.scarlet], [0.7, PAL.orange], [1, PAL.white]], u, out),
    })
    tube.shape(inner
      ? [V(side * 0.28, 0.12, 0.0), V(side * 0.62, 0.2, -0.55), V(side * 0.95, 0.1, -1.25)]
      : [V(side * 0.18, 0.27, 0.0), V(side * 0.32, 0.64, -0.5), V(side * 0.5, 0.88, -1.2), V(side * 0.66, 0.86, -2.1)])
    return tube.geometry
  }
  const earMeshes = [-1, 1].map((side) => {
    const ear = createPart(); ear.add(earGeometry(side, false))
    const mesh = ear.build(skin, side < 0 ? 'dragon-ear-left' : 'dragon-ear-right'); head.add(mesh)
    skull.add(earGeometry(side, true))
    return mesh
  })
  const skullMesh = skull.build(skin, 'dragon-skull'); head.add(skullMesh)
  const eyes = createPart()
  const slits = createPart()
  for (const side of [-1, 1]) {
    eyes.orb([side * 0.2, 0.15, 0.56], [0.12, 0.062, 0.09], PAL.white, PAL.gold, [0, side * 0.35, -side * 0.45])
    slits.orb([side * 0.262, 0.152, 0.59], [0.016, 0.085, 0.03], PAL.soot, PAL.soot, [0, side * 0.35, -side * 0.45])
  }
  head.add(eyes.build(eyeMaterial, 'dragon-eyes'), slits.build(slitMaterial, 'dragon-pupils'))

  const jaw = new THREE.Group(); jaw.position.set(0, -0.14, 0.18); head.add(jaw)
  const jawPart = createPart()
  const jawRings = 30
  const jawTube = createTube({
    rings: jawRings, sides: 16, rx: profile(jawRings, (u) => 0.23 - 0.1 * u), ry: profile(jawRings, (u) => 0.1 - 0.04 * u),
    color: (u, v, out) => ramp([[-1, PAL.white], [0, PAL.cream], [1, PAL.orange]], v, out),
  })
  jawTube.shape([V(0, -0.02, 0.05), V(0, -0.05, 0.75), V(0, -0.02, 1.62)])
  jawPart.add(jawTube.geometry)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) jawPart.cone(V(side * (0.2 - i * 0.015), 0.02, 0.3 + i * 0.22), V(0, 1, -0.1), i === 5 ? 0.26 : 0.15, 0.03, PAL.cream, PAL.white, 8)
    jawPart.cone(V(side * 0.2, -0.04, 0.1), V(side * 1, -0.35, -0.6), 0.5, 0.06, PAL.orange, PAL.white)
    jawPart.cone(V(side * 0.14, -0.1, 1.3), V(0, -1, -0.3), 0.22, 0.04, PAL.cream, PAL.white, 8)
  }
  jaw.add(jawPart.build(skin, 'dragon-jaw'))
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mouthMaterial)
  mouth.scale.set(0.17, 0.05, 0.78); mouth.position.set(0, 0.05, 0.85); mouth.name = 'dragon-mouth'; jaw.add(mouth)

  const breath = new THREE.Group(); breath.position.set(0, -0.04, 1.95); head.add(breath)
  const puffs = []
  for (let k = 0; k < 9; k++) {
    for (let layer = 0; layer < 3; layer++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 18, 1, true), flameMaterials[layer])
      cone.castShadow = false; cone.frustumCulled = false
      breath.add(cone); puffs.push({ cone, k, layer })
    }
  }
  const glow = new THREE.PointLight(0xff6a1a, 0, 34, 1.5); glow.position.set(0, 0, 1); breath.add(glow)
  breath.visible = false

  // --- Animation ---
  const state = { flap: 0, flapEnv: 0, heat: 0, windup: 0, yaw: 0 }
  const neckPoints = Array.from({ length: NECK_PITCH.length + 1 }, () => V())
  const tailPoints = Array.from({ length: TAIL_PITCH.length + 1 }, () => V())
  const headBasis = new THREE.Matrix4(), headFrame = new THREE.Quaternion(), headExtra = new THREE.Quaternion(), headEuler = new THREE.Euler()
  const tmpDir = V()
  let calls = 0

  const dragon = {
    root, head, breath, wings: wings.map((w) => w.group), ears: earMeshes, state,
    // World position of the dragon's breath, for ember sparks.
    mouth(target = V()) { breath.updateWorldMatrix(true, false); return breath.getWorldPosition(target.set(0, 0, 0)) },
    update(time, won = false) {
      const normals = calls++ % 4 === 0
      const flap = won ? { env: 0, wave: 0 } : flapState(time)
      const fire = won ? { windup: 0, heat: 0 } : fireState(time)
      const look = won ? 0 : Math.sin(time * 0.32) * 0.62 + Math.sin(time * 0.83 + 1) * 0.1
      const calm = 1 - fire.windup * 0.85
      Object.assign(state, { flap: flap.wave, flapEnv: flap.env, heat: fire.heat, windup: fire.windup, yaw: look * calm })

      // Neck: bone chain with the weight of looking, breathing and rearing to breathe fire.
      const pitchTotal = won ? -0.95 : Math.sin(time * 0.48) * 0.1 + fire.windup * 0.45 - fire.heat * 0.3
      const yawTotal = look * calm + (won ? 0 : Math.sin(time * 0.19 + 1.2) * 0.08)
      let yaw = 0, pitchOffset = 0
      neckPoints[0].copy(SHOULDER)
      NECK_PITCH.forEach((base, k) => {
        yaw += NECK_WEIGHT_YAW[k] * yawTotal; pitchOffset += NECK_WEIGHT_PITCH[k] * pitchTotal
        const pitch = base + pitchOffset, c = Math.cos(pitch)
        neckPoints[k + 1].copy(neckPoints[k]).add(tmpDir.set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c).multiplyScalar(NECK_SEGMENT))
      })
      neck.shape(neckPoints, normals)

      // Head follows the end of the neck, with its own glances.
      const end = neck.frames[neck.frames.length - 1]
      headBasis.makeBasis(tmpDir.copy(end.B).negate(), end.N, end.T)
      headFrame.setFromRotationMatrix(headBasis)
      const glance = won ? 0 : Math.sin(time * 0.19 + 1.2) * 0.3 * calm
      headExtra.setFromEuler(headEuler.set(won ? 0.2 : Math.sin(time * 0.7) * 0.07 - fire.heat * 0.04, glance, 0))
      head.position.copy(end.P); head.quaternion.copy(headFrame).multiply(headExtra)
      jaw.rotation.x = won ? 0.02 : 0.1 + fire.windup * 0.22 + fire.heat * 0.5 + Math.sin(time * 1.4) * 0.03

      // Fire: a hot plume of red, orange and white flame.
      breath.visible = fire.heat > 0.04
      for (const { cone, k, layer } of puffs) {
        const reach = fire.heat * (1 - layer * 0.1), flicker = 0.78 + 0.22 * Math.sin(time * 22 + k * 1.9 + layer)
        const radius = (0.13 + k * 0.115) * (1 - layer * 0.3) * flicker * Math.min(1, reach * 1.4)
        const length = (0.65 + k * 0.08) * Math.max(reach, 0.001)
        cone.scale.set(Math.max(radius, 0.001), length, Math.max(radius, 0.001))
        cone.position.set(0, 0, 0.1 + k * 0.5 * Math.min(1, reach * 1.1))
        cone.rotation.x = -Math.PI / 2
      }
      glow.intensity = fire.heat * 110

      // Tail: a travelling sway.
      let tailYaw = 0, tailPitch = 0
      tailPoints[0].copy(HIP)
      TAIL_PITCH.forEach((base, k) => {
        tailYaw += won ? 0 : Math.sin(time * 0.9 - k * 0.38) * 0.07
        tailPitch += won ? 0 : Math.sin(time * 1.3 - k * 0.3) * 0.012
        const pitch = base + tailPitch, c = Math.cos(pitch)
        tailPoints[k + 1].copy(tailPoints[k]).add(tmpDir.set(Math.sin(tailYaw) * c, Math.sin(pitch), -Math.cos(tailYaw) * c).multiplyScalar(TAIL_SEGMENT))
      })
      tail.shape(tailPoints, normals)

      // Wings: held wide open; strong beats at regular intervals, a gentle sway between.
      const sway = won ? 0 : Math.sin(time / FLAP_PERIOD * Math.PI * 2) * 0.03
      const shoulder = won ? -0.12 : 0.36 + sway + flap.env * flap.wave * 0.62
      const elbow = won ? -0.5 : -0.1 + flap.env * flap.wave * -0.2
      const wrist = won ? -0.7 : -0.12 + flap.env * Math.sin(Math.PI * 2 * FLAP_BEATS * (((time % FLAP_PERIOD) - FLAP_START) / FLAP_LENGTH) - 1.1) * -0.55
      wings.forEach((wing) => wing.pose({ shoulder, elbow, wrist, flutter: won ? 0 : 0.4 + flap.env, time, normals }))
      rig.position.y = won ? 0 : flap.env * (1 - flap.wave) * 0.07
      root.rotation.x = won ? -0.14 : 0
    },
  }
  dragon.update(0, false)
  return dragon
}
