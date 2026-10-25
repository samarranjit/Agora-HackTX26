import * as THREE from 'three'
import { smooth, V, hex, ramp, bake, createPart, createTube, createGrid, glowByColor, profile } from './modelKit.js'

// The Storywood Princess: a smooth, detailed storybook beauty. A sculpted face with painted
// features, flowing auburn hair, a layered ball gown, a jewelled tiara. Fixed parts are merged
// into a few vertex-coloured meshes; the skirt, hair locks and arms are re-laid every frame.
// Units are local; the hall scales her. +z is forward, +y is up, her feet are at y = 0.

const TAU = Math.PI * 2
const { lerp, clamp } = THREE.MathUtils
const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2))
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s) }

const C = {
  skin: hex(0xf7d2b8), skinLight: hex(0xfce3d2), skinShade: hex(0xe3a58a), blush: hex(0xf0868f),
  lipUpper: hex(0xcf4a66), lipLower: hex(0xe8708b), lipLine: hex(0x962f4c), brow: hex(0x6a3a22), lash: hex(0x24150e), lilac: hex(0xc9aee8),
  hairRoot: hex(0x2e1308), hair: hex(0x512410), hairWarm: hex(0x75391a), hairLight: hex(0xa9703a),
  rose: hex(0xd2508a), pink: hex(0xf2a0c6), blushPink: hex(0xfbd2e4), cream: hex(0xfff4ee), white: hex(0xffffff),
  lavender: hex(0xdcc6f4), lilacGown: hex(0xc3a0e6), gold: hex(0xf2c35c), goldDeep: hex(0xc2862a), pearl: hex(0xfff7ee),
  gemPink: hex(0xff5fa6), gemBlue: hex(0x62b0ff), gemWhite: hex(0xf4fbff),
  irisOuter: hex(0x23358f), iris: hex(0x4f73dc), irisLight: hex(0x9fc8ff), pupil: hex(0x120d22), sclera: hex(0xfffaf6),
}

// A smooth curve through (position, value) pairs.
function spline(points) {
  return (u) => {
    if (u <= points[0][0]) return points[0][1]
    for (let i = 1; i < points.length; i++) {
      if (u <= points[i][0]) {
        const p0 = points[Math.max(0, i - 2)], p1 = points[i - 1], p2 = points[i], p3 = points[Math.min(points.length - 1, i + 1)]
        const span = p2[0] - p1[0], t = (u - p1[0]) / span, t2 = t * t, t3 = t2 * t
        const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * span, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * span
        return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2
      }
    }
    return points[points.length - 1][1]
  }
}

// ---------- The head ----------

const PIVOT = V(0, 2.12, 0.02) // where the neck meets the skull; the head turns about this point
const HEAD_Y0 = 2.07, HEAD_H = 0.6
const headRx = spline([[0, 0], [0.05, 0.075], [0.16, 0.165], [0.32, 0.235], [0.48, 0.268], [0.62, 0.275], [0.78, 0.255], [0.9, 0.19], [0.97, 0.09], [1, 0]])
const headRz = spline([[0, 0], [0.05, 0.06], [0.16, 0.13], [0.32, 0.195], [0.48, 0.232], [0.62, 0.247], [0.78, 0.24], [0.9, 0.19], [0.97, 0.09], [1, 0]])
const headZc = spline([[0, 0.1], [0.16, 0.055], [0.4, 0.012], [0.7, -0.018], [1, -0.04]])

// Columns are packed more tightly round the front, where the face is.
const phiOf = (c) => { const t = c * 2 - 1, a = Math.abs(t); return Math.sign(t) * Math.PI * (0.55 * a + 0.45 * a ** 3) }

// Sculpted relief on the front of the face: nose, lips, chin, eye sockets, brows and cheeks.
function faceRelief(x, y) {
  const a = Math.abs(x)
  let z = 0
  z += 0.066 * gauss(a, y, 0, 2.325, 0.03, 0.055)
  z += 0.028 * gauss(a, y, 0, 2.283, 0.03, 0.02)
  z += 0.012 * gauss(a, y, 0.034, 2.285, 0.016, 0.014)
  z += 0.021 * gauss(a, y, 0, 2.219, 0.055, 0.014)
  z += 0.027 * gauss(a, y, 0, 2.185, 0.05, 0.016)
  z -= 0.016 * gauss(a, y, 0, 2.2, 0.055, 0.004)
  z += 0.016 * gauss(a, y, 0, 2.108, 0.05, 0.03)
  z -= 0.012 * gauss(a, y, 0.112, 2.405, 0.06, 0.042)
  z += 0.012 * gauss(a, y, 0.115, 2.462, 0.07, 0.016)
  z += 0.02 * gauss(a, y, 0.15, 2.3, 0.07, 0.06)
  return z
}

// The head's surface point in body coordinates. `phi` is the angle round the head (0 = the front).
function headSurface(phi, u, out, grow = 0, relief = false) {
  const y = HEAD_Y0 + HEAD_H * u
  const x = (headRx(u) + grow) * Math.sin(phi)
  let z = headZc(u) + (headRz(u) + grow) * Math.cos(phi)
  if (relief) z += faceRelief(x, y) * smooth(0.15, 0.85, Math.cos(phi))
  return out.set(x, y, z)
}
const toHead = (p) => p.set(p.x - PIVOT.x, p.y - PIVOT.y, p.z - PIVOT.z)

function headColor(c, u, out) {
  const phi = phiOf(c), front = Math.cos(phi)
  const y = HEAD_Y0 + HEAD_H * u, x = headRx(u) * Math.sin(phi), a = Math.abs(x)
  out.copy(C.skin).lerp(C.skinLight, smooth(0.55, 0.9, u) * 0.5).lerp(C.skinShade, (1 - smooth(0, 0.22, u)) * 0.6)
  if (front <= 0.05) return out
  const f = smooth(0.05, 0.6, front)
  out.lerp(C.blush, gauss(a, y, 0.155, 2.295, 0.065, 0.055) * 0.5 * f)
  out.lerp(C.lilac, gauss(a, y, 0.115, 2.44, 0.075, 0.03) * 0.34 * f)
  out.lerp(C.blush, gauss(a, y, 0, 2.283, 0.026, 0.016) * 0.28 * f)
  out.lerp(C.skinShade, gauss(a, y, 0.036, 2.282, 0.012, 0.01) * 0.6 * f)
  out.lerp(C.skinShade, gauss(a, y, 0, 2.253, 0.04, 0.012) * 0.22 * f)
  const lips = smooth(1, 0.35, Math.hypot(a / 0.062, (y - (y >= 2.2 ? 2.2 : 2.2)) / (y >= 2.2 ? 0.024 : 0.03)))
  out.lerp(y >= 2.2 ? C.lipUpper : C.lipLower, lips * 0.95 * f)
  out.lerp(C.lipLine, gauss(a, y, 0, 2.2, 0.05, 0.0035) * 0.9 * f)
  // Brows: an arch from the inner end, rising to a peak, tapering at the outer end.
  const arch = clamp((a - 0.055) / 0.15, 0, 1), brow = 2.463 + 0.028 * Math.sin(Math.PI * arch ** 0.9)
  const strength = smooth(0.0095, 0.0045, Math.abs(y - brow)) * smooth(0.045, 0.07, a) * (1 - smooth(0.19, 0.215, a))
  out.lerp(C.brow, strength * 0.85 * f)
  return out
}

// ---------- Hair ----------

const hairStart = (phi) => lerp(0.8, 0.02, smooth(0.25, 1.5, Math.abs(phi)))
function hairColor(c, v, out) {
  const phi = phiOf(c), u = lerp(hairStart(phi), 1, v)
  const streak = 0.5 + 0.5 * Math.sin(phi * 44 + u * 26)
  ramp([[0, C.hairRoot], [0.45, C.hair], [0.8, C.hairWarm], [1, C.hair]], u, out)
  const sheen = gauss(Math.sin(phi), u, 0.1, 0.78, 0.45, 0.14)
  return out.lerp(C.hairLight, sheen * 0.4 + streak * 0.1).lerp(C.hairRoot, (1 - smooth(0, 0.35, v)) * 0.25)
}

// ---------- The gown ----------

const WAIST_Y = 1.12, HEM_Y = 0.07
const skirtRadius = (v) => 0.205 + 0.72 * (1 - (1 - v) ** 1.9)
function pleats(phi, v) { return 0.045 * Math.sin(phi * 22) * smooth(0.04, 0.4, v) + 0.02 * Math.sin(phi * 9 + 0.7) * smooth(0.2, 0.8, v) }

function underskirtColor(c, v, out) {
  const phi = Math.PI + c * TAU
  ramp([[0, C.rose], [0.32, C.pink], [0.78, C.blushPink], [1, C.cream]], v, out)
  out.multiplyScalar(0.9 + 0.1 * Math.cos(phi * 22) * smooth(0.04, 0.4, v) + 0.1 * (1 - smooth(0.04, 0.4, v)))
  out.lerp(C.gold, smooth(0.011, 0.004, Math.abs(v - 0.74)) * 0.9)
  const motif = Math.sin(phi * 11) * Math.sin(v * 38 + 1)
  out.lerp(C.gold, smooth(0.86, 0.95, motif) * smooth(0.5, 0.64, v) * (1 - smooth(0.7, 0.72, v)) * 0.75)
  return out.lerp(C.white, hash(c * 977, v * 613) > 0.993 ? 0.9 : 0)
}
function overskirtColor(c, v, out) {
  ramp([[0, C.lilacGown], [0.4, C.lavender], [0.85, C.cream], [1, C.white]], v, out)
  out.multiplyScalar(0.92 + 0.08 * Math.cos((c * 0.8 + 0.1) * TAU * 3.4 * 2))
  out.lerp(C.gold, smooth(0.02, 0.006, Math.min(c, 1 - c)) * 0.95)
  out.lerp(C.gold, smooth(0.012, 0.004, Math.abs(v - 0.9)) * 0.8)
  return out.lerp(C.white, hash(c * 811, v * 457) > 0.994 ? 0.9 : 0)
}
const ruffleColor = (c, v, out) => ramp([[0, C.blushPink], [0.6, C.cream], [1, C.white]], v, out)

// The bodice is one tube from the waist, over the bust and shoulders, up the neck.
const TORSO_Y0 = 1.1, TORSO_H = 1.1
const torsoRx = spline([[1.1, 0.19], [1.3, 0.2], [1.5, 0.245], [1.7, 0.27], [1.82, 0.3], [1.9, 0.32], [1.97, 0.235], [2.03, 0.135], [2.08, 0.085], [2.2, 0.074]])
const torsoRz = spline([[1.1, 0.15], [1.3, 0.16], [1.5, 0.2], [1.7, 0.19], [1.82, 0.17], [1.9, 0.15], [1.97, 0.12], [2.03, 0.09], [2.08, 0.075], [2.2, 0.07]])
function bodiceColor(u, v, out) {
  const y = TORSO_Y0 + TORSO_H * u
  const neckline = 1.8 + 0.04 * (1 - smooth(0, 0.9, v)) + 0.16 * smooth(0, -0.8, v)
  if (y > neckline) return out.copy(C.skin).lerp(C.skinLight, smooth(1.9, 2.15, y) * 0.35).lerp(C.skinShade, smooth(2.05, 2.2, y) * 0.35)
  ramp([[1.1, C.rose], [1.45, C.pink], [1.8, C.blushPink]], y, out)
  const panel = smooth(0.5, 0.8, v)
  out.lerp(C.blushPink, panel * 0.55)
  out.lerp(C.gold, smooth(0.018, 0.006, Math.abs(v - (0.5 + 0.38 * smooth(1.15, 1.75, y)))) * smooth(1.15, 1.2, y) * 0.8)
  out.multiplyScalar(1 - 0.07 * smooth(0.9, 1, Math.sin(Math.acos(clamp(v, -1, 1)) * 15)))
  const lacing = smooth(0.9, 0.97, Math.abs(Math.sin(y * 38 + (v < -0.7 ? 0 : 99)))) * smooth(-0.62, -0.85, v)
  out.lerp(C.gold, lacing * 0.8)
  out.lerp(C.gold, smooth(0.016, 0.006, Math.abs(y - neckline)) * 0.95)
  return out.lerp(C.goldDeep, (1 - smooth(1.1, 1.17, y)) * 0.9)
}

// ---------- Face parts ----------

const EYE = { x: 0.112, y: 2.405 }
function frontZ(x, y) {
  const u = (y - HEAD_Y0) / HEAD_H, rx = headRx(u), cosPhi = Math.sqrt(Math.max(0, 1 - (x / rx) ** 2))
  return headZc(u) + headRz(u) * cosPhi + faceRelief(x, y)
}

export function createStoryPrincess() {
  const root = new THREE.Group(); root.name = 'Storywood Princess'
  const body = new THREE.Group(); body.name = 'princess-body'; root.add(body)

  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.02, emissive: 0xffffff, emissiveIntensity: 0.18 })
  const clothMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.04, sheen: 0.7, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xffd6ea), emissive: 0xffffff, emissiveIntensity: 0.2 })
  const hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.08, emissive: 0xffffff, emissiveIntensity: 0.05 })
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf2c35c, roughness: 0.26, metalness: 0.85, emissive: 0x4a2f06, emissiveIntensity: 0.5 })
  const gemMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.65, flatShading: true })
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.28 })
  const lashMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })
  glowByColor(skinMat, 'princess-skin-glow'); glowByColor(clothMat, 'princess-cloth-glow'); glowByColor(hairMat, 'princess-hair-glow')
  glowByColor(gemMat, 'princess-gem-glow'); glowByColor(eyeMat, 'princess-eye-glow')
  root.userData.ownedMaterials = [skinMat, clothMat, hairMat, goldMat, gemMat, eyeMat, lashMat]
  const shaded = (geometry, material, name, castShadow = true) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name; mesh.castShadow = castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false
    return mesh
  }

  // --- Head group: skull, face, eyes, hair cap, tiara ---
  const head = new THREE.Group(); head.name = 'princess-head'; head.position.copy(PIVOT); body.add(head)
  const skull = createGrid({ cols: 84, rows: 70, color: headColor })
  skull.lay((c, v, out) => toHead(headSurface(phiOf(c), v, out, 0, true)))
  head.add(shaded(skull.geometry, skinMat, 'princess-face'))

  const cap = createGrid({ cols: 84, rows: 36, color: hairColor, flip: false })
  cap.lay((c, v, out) => {
    const phi = phiOf(c), u = lerp(hairStart(phi), 1, v)
    const back = smooth(0.1, 1, -Math.cos(phi)), grow = 0.02 + 0.07 * back * gauss(u, 0, 0.55, 0, 0.3, 1) + 0.025 * gauss(u, 0, 0.78, 0, 0.18, 1)
    toHead(headSurface(phi, u, out, grow))
  })
  head.add(shaded(cap.geometry, hairMat, 'princess-hair-cap'))

  // Eyes: glossy, large, with a bright catch-light. They sit in a group so they can blink.
  const eyeParts = createPart(), lashParts = createPart()
  const sphere = new THREE.SphereGeometry(1, 24, 18), dot = new THREE.SphereGeometry(1, 10, 7)
  const eyeBit = (frame, offset, scale, colorOf, source = sphere) => {
    const m = frame.clone().multiply(new THREE.Matrix4().compose(V(...offset), new THREE.Quaternion(), V(...scale)))
    eyeParts.add(bake(source, m, colorOf))
  }
  const white = (x, y, z, out) => out.copy(C.sclera).lerp(C.skinShade, smooth(0.55, 1, Math.hypot(x, y)) * 0.18)
  const irisColor = (x, y, z, out) => {
    const r = Math.hypot(x, y)
    if (r < 0.36) return out.copy(C.pupil)
    ramp([[0.36, C.irisLight], [0.58, C.iris], [0.86, C.irisOuter], [1, C.pupil]], r, out)
    return out.multiplyScalar(0.78 + 0.22 * smooth(-0.7, 0.6, y)).lerp(C.irisLight, smooth(0.7, 0.2, Math.hypot(x - 0.25, y + 0.3)) * 0.25)
  }
  const catchLight = (x, y, z, out) => out.copy(C.white)
  const eyeCentre = V(0, EYE.y - PIVOT.y, 0)
  for (const side of [-1, 1]) {
    const x = side * EYE.x, z = frontZ(x, EYE.y) - PIVOT.z
    const frame = new THREE.Matrix4().compose(V(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * 0.2, 0)), V(1, 1, 1))
    eyeBit(frame, [0, 0, -0.018], [0.058, 0.044, 0.034], white)
    eyeBit(frame, [side * -0.004, -0.001, 0.012], [0.037, 0.041, 0.014], irisColor)
    eyeBit(frame, [0.014 - 0.008 * side, 0.016, 0.0245], [0.0105, 0.0105, 0.004], catchLight, dot)
    eyeBit(frame, [-0.011 + 0.006 * side, -0.014, 0.0245], [0.0052, 0.0052, 0.003], catchLight, dot)
    // Upper lid line and lashes along the top of the eye; a faint lower line.
    const lid = (lower) => Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI * (side > 0 ? 1 - i / 8 : i / 8)
      const px = 0.05 * Math.cos(a) * 1.0, py = (lower ? -0.034 : 0.039) * Math.abs(Math.sin(a)) ** 0.85 * 0.97
      return V(px, py, 0.012 - 0.008 * Math.abs(Math.cos(a))).applyMatrix4(frame)
    })
    for (const lower of [false, true]) {
      const rings = 20, thick = lower ? 0.0026 : 0.0058
      const line = createTube({
        rings, sides: 6, rx: profile(rings, (t) => thick * (0.55 + 0.55 * t)), ry: profile(rings, (t) => thick * (0.55 + 0.55 * t)),
        color: (t, v, out) => out.copy(C.lash).lerp(C.brow, lower ? 0.5 : 0.1),
      })
      line.shape(lid(lower))
      lashParts.add(line.geometry)
    }
    for (let k = 0; k < 5; k++) {
      const a = Math.PI * (side > 0 ? 0.04 + k * 0.1 : 0.96 - k * 0.1), base = V(0.05 * Math.cos(a), 0.039 * Math.sin(a) * 0.97, 0.01).applyMatrix4(frame)
      const dir = V(side * (0.9 + k * 0.05), 0.55 + k * 0.08, 0.18).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * 0.2, 0)))
      lashParts.cone(base, dir, 0.034 - k * 0.002, 0.0036, C.lash, C.lash, 5)
    }
  }
  const eyes = new THREE.Group(); eyes.name = 'princess-eyes'; eyes.position.copy(eyeCentre); head.add(eyes)
  eyes.add(eyeParts.build(eyeMat, 'princess-eyes-mesh', { smooth: true }), lashParts.build(lashMat, 'princess-lashes', { smooth: true }))
  sphere.dispose(); dot.dispose()

  // --- Tiara, earrings ---
  const gold = createPart(), gems = createPart()
  const crownY = 2.6, ringR = V(0.25, 0, 0.24)
  const crownFrame = new THREE.Matrix4().compose(V(0, crownY - PIVOT.y, headZc((crownY - HEAD_Y0) / HEAD_H) - PIVOT.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0)), V(1, 1, 1))
  const place = (v) => v.applyMatrix4(crownFrame)
  const flat = new THREE.Matrix4().multiplyMatrices(crownFrame, new THREE.Matrix4().compose(V(0, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(ringR.x, ringR.z, 1)))
  gold.add(bake(new THREE.TorusGeometry(1, 0.014, 12, 96), flat, () => {}))
  for (let k = -3; k <= 3; k++) {
    const a = k * 0.27, up = V(Math.sin(a) * 0.1, 1, Math.cos(a) * 0.1).normalize(), base = place(V(Math.sin(a) * ringR.x, 0.005, Math.cos(a) * ringR.z))
    const h = 0.04 + 0.085 * Math.cos(k * Math.PI / 7) ** 2
    gold.cone(base, up, h, 0.027, C.gold, C.gold, 12)
    gems.orb(base.clone().addScaledVector(up, h + 0.014).toArray(), [0.019, 0.019, 0.019], C.pearl, C.pearl, [0, 0, 0], 0.5)
    const mid = place(V(Math.sin(a + 0.135) * ringR.x, 0.012, Math.cos(a + 0.135) * ringR.z))
    gems.orb(mid.toArray(), [0.012, 0.012, 0.012], C.gemBlue, C.gemBlue, [0, 0, 0], 0.4)
  }
  gems.orb(place(V(0, 0.002, ringR.z + 0.016)).toArray(), [0.034, 0.046, 0.022], C.gemPink, C.gemPink, [0, 0, 0], 0.55)
  gold.orb(place(V(0, 0.002, ringR.z + 0.008)).toArray(), [0.046, 0.058, 0.016], C.gold, C.goldDeep, [0, 0, 0], 0.55)
  for (let k = 0; k < 18; k++) {
    const a = Math.PI * 0.62 + k * (TAU - Math.PI * 1.24) / 17
    gems.orb(place(V(Math.sin(a) * ringR.x, 0.01, Math.cos(a) * ringR.z)).toArray(), [0.012, 0.012, 0.012], C.pearl, C.pearl, [0, 0, 0], 0.4)
  }
  for (const side of [-1, 1]) {
    const lobe = V(side * 0.262, 2.255 - PIVOT.y, 0.0 - PIVOT.z)
    gold.orb(lobe.toArray(), [0.011, 0.011, 0.011], C.gold, C.gold, [0, 0, 0], 0.4)
    gems.orb(lobe.clone().add(V(0, -0.05, 0)).toArray(), [0.017, 0.022, 0.017], C.pearl, C.pearl, [0, 0, 0], 0.5)
  }
  head.add(gold.build(goldMat, 'princess-tiara-gold', { smooth: true }), gems.build(gemMat, 'princess-tiara-gems', { smooth: true }))

  // A fringe swept across the forehead from a side parting.
  const hairTone = (u, v, out, k = 0) => ramp([[0, C.hairRoot], [0.25, C.hair], [0.62, C.hairWarm], [1, C.hairLight]], u, out)
    .lerp(C.hairLight, (0.5 + 0.5 * Math.sin(u * 30 + k * 2)) * 0.14 + smooth(0.2, 1, v) * 0.12)
  const fringeSpecs = [[-0.4, 1.3, 0.905, 0.52, 0.062], [-0.2, 1.38, 0.93, 0.5, 0.05], [-0.55, 1.15, 0.87, 0.56, 0.045]]
  fringeSpecs.forEach(([phi0, phi1, u0, u1, width], k) => {
    const rings = 36, sweep = Array.from({ length: 5 }, (_, i) => {
      const s = i / 4, grow = 0.028 + 0.012 * Math.sin(s * Math.PI)
      return toHead(headSurface(lerp(phi0, phi1, s), lerp(u0, u1, s) - 0.025 * Math.sin(s * Math.PI), V(), grow))
    })
    const tube = createTube({ rings, sides: 12, reference: V(0, 0, 1), rx: profile(rings, (s) => 0.012 + (width - 0.012) * (1 - s) ** 0.5), ry: profile(rings, (s) => 0.012 + 0.014 * (1 - s)), color: (s, v, out) => hairTone(0.35 + 0.5 * s, v, out, k) })
    tube.shape(sweep)
    head.add(shaded(tube.geometry, hairMat, `princess-fringe-${k}`))
  })

  // --- Torso and gown top ---
  const TORSO_RINGS = 72, TORSO_SIDES = 52
  const torso = createTube({
    rings: TORSO_RINGS, sides: TORSO_SIDES,
    rx: profile(TORSO_RINGS, (u) => torsoRx(TORSO_Y0 + TORSO_H * u)), ry: profile(TORSO_RINGS, (u) => torsoRz(TORSO_Y0 + TORSO_H * u)),
    color: bodiceColor, reference: V(0, 0, 1),
  })
  torso.shape(Array.from({ length: 5 }, (_, i) => V(0, TORSO_Y0 + TORSO_H * i / 4, 0)))
  const torsoMesh = shaded(torso.geometry, clothMat, 'princess-bodice')
  body.add(torsoMesh)

  const trim = createPart(), trimGems = createPart()
  for (const side of [-1, 1]) {
    // Puffed sleeves with a frill.
    trim.orb([side * 0.3, 1.88, 0.0], [0.15, 0.13, 0.14], C.pink, C.rose, [0, 0, side * 0.2], 1.1)
    trim.orb([side * 0.31, 1.78, 0.0], [0.115, 0.05, 0.115], C.white, C.cream, [0, 0, side * 0.1], 0.8)
  }
  trimGems.orb([0, 1.16, 0.205], [0.034, 0.04, 0.02], C.gemPink, C.gemPink, [0, 0, 0], 0.5)
  trim.orb([0, 1.15, 0.2], [0.07, 0.045, 0.03], C.gold, C.goldDeep, [0, 0, 0], 0.9)
  // A bow at the back of the waist.
  for (const side of [-1, 1]) {
    trim.orb([side * 0.14, 1.22, -0.2], [0.14, 0.075, 0.04], C.rose, C.pink, [0, 0, side * 0.35], 1.2)
    trim.cone(V(side * 0.05, 1.18, -0.2), V(side * 0.35, -1, -0.15), 0.42, 0.045, C.rose, C.pink, 8)
  }
  trim.orb([0, 1.22, -0.205], [0.045, 0.045, 0.04], C.gold, C.goldDeep, [0, 0, 0], 0.9)
  // A pearl necklace with a pendant.
  for (let k = 0; k < 30; k++) {
    const a = k / 30 * TAU, dip = 0.05 * Math.max(0, Math.cos(a)) ** 2
    trimGems.orb([Math.sin(a) * 0.118, 2.015 - dip, Math.cos(a) * 0.108], [0.0165, 0.0165, 0.0165], C.pearl, C.pearl, [0, 0, 0], 0.4)
  }
  trimGems.orb([0, 1.9, 0.125], [0.026, 0.038, 0.02], C.gemPink, C.gemPink, [0, 0, 0], 0.5)
  trim.orb([0, 1.9, 0.115], [0.034, 0.046, 0.02], C.gold, C.goldDeep, [0, 0, 0], 0.5)
  body.add(trim.build(clothMat, 'princess-trim', { smooth: true }), trimGems.build(gemMat, 'princess-jewels', { smooth: true }))

  // --- Skirt: pleated underskirt, open-front overskirt and a lace flounce, all swaying ---
  const SKIRT_COLS = 76, SKIRT_ROWS = 40
  const motion = { step: 0, sway: 0, time: 0, wind: 1 }
  const skirtPoint = (phi, v, out, scale = 1, hem = 0) => {
    const radius = skirtRadius(v) * (1 + pleats(phi, v)) * scale
    const train = Math.cos(phi) < 0 ? Math.cos(phi) * 0.3 * v * v : 0
    const swing = motion.step * 0.1 * v * v, side = motion.sway * 0.05 * v * v
    const ripple = 1 + 0.012 * Math.sin(phi * 8 - motion.time * 1.6) * v * motion.wind
    const twist = phi + motion.sway * 0.05 * v
    return out.set(radius * ripple * Math.sin(twist) + side, lerp(WAIST_Y, HEM_Y, v) + hem, radius * ripple * Math.cos(twist) * 0.92 + train + swing)
  }
  const under = createGrid({ cols: SKIRT_COLS, rows: SKIRT_ROWS, color: underskirtColor, flip: true })
  const layUnder = (normals) => under.lay((c, v, out) => skirtPoint(Math.PI + c * TAU, v, out), normals)
  const over = createGrid({ cols: 62, rows: 32, color: overskirtColor, flip: true })
  const layOver = (normals) => over.lay((c, r, out) => {
    const v = lerp(0.03, 0.96, r), phi = 0.55 + c * (TAU - 1.1)
    return skirtPoint(phi, v, out, 1.05, 0.026 * (1 - Math.cos(phi * 15)) / 2 * smooth(0.86, 1, v))
  }, normals)
  const flounce = createGrid({ cols: SKIRT_COLS, rows: 8, color: ruffleColor, flip: true })
  const layFlounce = (normals) => flounce.lay((c, r, out) => {
    const phi = Math.PI + c * TAU, v = lerp(0.84, 1, r)
    return skirtPoint(phi, v, out, 1.045, 0.014 * Math.sin(phi * 24) * smooth(0.86, 1, v) + 0.012)
  }, normals)
  const skirt = new THREE.Group(); skirt.name = 'princess-skirt'; body.add(skirt)
  for (const [grid, name] of [[under, 'under'], [over, 'over'], [flounce, 'flounce']]) {
    const mesh = shaded(grid.geometry, clothMat, `princess-skirt-${name}`)
    skirt.add(mesh)
  }

  // --- Slippers peeking from under the hem ---
  const slipperPart = (side) => {
    const part = createPart()
    part.orb([0, 0.035, 0.05], [0.052, 0.036, 0.115], C.pink, C.rose, [0, 0, 0], 1)
    part.orb([0, 0.05, 0.1], [0.035, 0.022, 0.03], C.gemPink, C.gemPink, [0, 0, 0], 0.5)
    const mesh = part.build(clothMat, side < 0 ? 'princess-slipper-left' : 'princess-slipper-right', { smooth: true })
    const group = new THREE.Group(); group.position.set(side * 0.14, 0, 0.15); group.add(mesh)
    return group
  }
  const slippers = [slipperPart(-1), slipperPart(1)]
  slippers.forEach((s) => body.add(s))

  // --- Arms and hands ---
  const SHOULDER = (side) => V(side * 0.31, 1.88, 0)
  const armTube = () => {
    const rings = 30
    const radius = (t) => 0.056 - 0.02 * t + 0.032 * Math.exp(-(((t - 0.9) / 0.07) ** 2))
    return createTube({
      rings, sides: 14, rx: profile(rings, radius), ry: profile(rings, radius),
      color: (t, v, out) => (t > 0.84 ? out.copy(C.white).lerp(C.cream, 0.4 + 0.3 * Math.sin(t * 160)) : out.copy(C.skin).lerp(C.skinLight, 0.3 * smooth(0.2, 1, v))),
    })
  }
  const handFor = (side) => {
    const part = createPart()
    part.orb([0, 0, 0.032], [0.036, 0.014, 0.046], C.skin, C.skinShade, [0, 0, 0], 1)
    const finger = (x, y, z, length, spread, curl) => {
      const rings = 8, radius = (t) => 0.0088 * (1 - 0.55 * t) * (1 - smooth(0.8, 1, t) * 0.7) + 0.0015
      const tube = createTube({ rings, sides: 6, rx: profile(rings, radius), ry: profile(rings, radius), color: (t, v, out) => out.copy(C.skin).lerp(C.blush, smooth(0.85, 1, t) * 0.3) })
      tube.shape([V(x, y, z), V(x + spread * length * 0.5, y - curl * 0.3, z + length * 0.55), V(x + spread * length, y - curl, z + length)])
      part.add(tube.geometry)
    }
    ;[[-0.026, 0.05, 0.06, -0.06], [-0.009, 0.056, 0.066, 0.0], [0.009, 0.052, 0.062, 0.03], [0.026, 0.045, 0.05, 0.08]].forEach(([x, z, len, spread]) => finger(x, 0, z, len, spread, 0.02))
    finger(side * -0.034, -0.004, 0.012, 0.05, side * -0.5, 0.012)
    const mesh = part.build(skinMat, side < 0 ? 'princess-hand-left' : 'princess-hand-right', { smooth: true })
    const group = new THREE.Group(); group.add(mesh)
    return group
  }
  const arms = [-1, 1].map((side) => ({ side, tube: armTube(), hand: handFor(side) }))
  arms.forEach((arm) => {
    arm.mesh = shaded(arm.tube.geometry, skinMat, arm.side < 0 ? 'princess-arm-left' : 'princess-arm-right')
    body.add(arm.mesh, arm.hand)
  })
  const rotX = (v, a, out) => out.set(v.x, v.y * Math.cos(a) - v.z * Math.sin(a), v.y * Math.sin(a) + v.z * Math.cos(a))

  // --- Hair locks that sway ---
  // Each lock is a smooth curve from the scalp: long waves down the back, and two ringlets
  // per side that fall over the shoulder and curl in on the chest.
  const LOCK_POINTS = 8
  const along = (fn) => Array.from({ length: LOCK_POINTS }, (_, j) => fn(j / (LOCK_POINTS - 1)))
  const lockSpecs = []
  const backLengths = [0.95, 1.05, 0.9, 1.0, 0.92, 1.04, 0.97]
  for (let k = 0; k < 7; k++) {
    const x0 = (k - 3) * 0.072, length = 1.5 * backLengths[k]
    lockSpecs.push({
      width: 0.1, phase: k * 0.9, drift: 1,
      base: along((s) => V(x0 * (1 + 0.25 * s) + 0.04 * Math.sin(s * 5.5 + k * 1.7) * s, 2.5 - length * s ** 0.95, -0.22 - 0.13 * Math.sin(s * Math.PI * 0.9) + 0.03 * Math.sin(s * 6 + k))),
    })
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      lockSpecs.push({
        width: 0.055, phase: side * 1.7 + 4 + k * 1.3, drift: 0.7,
        base: along((s) => V(
          side * (0.245 + 0.1 * Math.sin(s * Math.PI * 0.9) ** 0.7 + 0.034 * k + 0.03 * Math.sin(s * 8 + k * 2) * s - 0.075 * smooth(0.8, 1, s)),
          2.5 - (1.05 + 0.08 * k) * s,
          0.02 + 0.28 * s ** 1.2 + 0.02 * Math.sin(s * 7 + k),
        )),
      })
    }
  }
  const yawFraction = Array.from({ length: LOCK_POINTS }, (_, j) => Math.max(0, 1 - (j / (LOCK_POINTS - 1)) * 1.05) ** 1.2)
  const LOCK_RINGS = 34
  const locks = lockSpecs.map((spec, k) => {
    const tube = createTube({
      rings: LOCK_RINGS, sides: 12, reference: V(0, 0, 1),
      rx: profile(LOCK_RINGS, (u) => 0.03 + (spec.width - 0.03) * (1 - u) ** 0.55), ry: profile(LOCK_RINGS, (u) => 0.016 + 0.03 * (1 - u) ** 0.5),
      color: (u, v, out) => hairTone(u, v, out, k),
    })
    const mesh = shaded(tube.geometry, hairMat, `princess-hair-lock-${k}`)
    body.add(mesh)
    return { tube, mesh, spec, points: spec.base.map(() => V()) }
  })

  // --- Animation ---
  const state = { blink: 0, yaw: 0, step: 0 }
  let calls = 0
  const wrist = V(), elbow = V(), shoulder = V(), dir = V(), upper = V(), fore = V(), tip = V(), restElbow = V(), restWrist = V()
  const handRoll = new THREE.Quaternion(), forward = V(0, 0, 1)
  const clasped = { elbow: V(0.4, 1.57, 0.07), wrist: V(0.1, 1.29, 0.32) }

  const princess = {
    root, head, eyes, state, arms: arms.map((a) => a.mesh), locks: locks.map((l) => l.mesh), skirt,
    update(time, walking = false) {
      const normals = calls++ % 4 === 0
      const step = walking ? Math.sin(time * 7.4) : 0
      const sway = walking ? Math.sin(time * 3.7) : Math.sin(time * 0.7) * 0.4
      const phase = time % 3.9, blink = phase < 0.16 ? Math.sin(phase / 0.16 * Math.PI) : 0
      const yaw = walking ? Math.sin(time * 3.7) * 0.05 : Math.sin(time * 0.45) * 0.22 + Math.sin(time * 0.17 + 1) * 0.08
      Object.assign(state, { blink, yaw, step })
      Object.assign(motion, { step, sway, time, wind: walking ? 1.8 : 1 })

      // Body: breathing when still, a light bounce when walking.
      const breath = walking ? 0 : Math.sin(time * 1.5)
      body.position.y = Math.abs(step) * 0.05 + breath * 0.004
      body.rotation.y = sway * (walking ? 0.05 : 0.02)
      torsoMesh.scale.set(1 + breath * 0.006, 1, 1 + breath * 0.012)
      layUnder(normals); layOver(normals); layFlounce(normals)

      // Head: looks around gently, tilts with a smile.
      head.rotation.set(Math.sin(time * 0.6) * 0.035 + (walking ? -0.02 : 0.01), yaw, Math.sin(time * 0.5) * 0.03)
      eyes.scale.y = 1 - blink * 0.94

      // Slippers step beneath the hem.
      slippers.forEach((slipper, i) => {
        const phaseStep = i === 0 ? step : -step
        slipper.position.z = 0.15 + phaseStep * 0.18
        slipper.position.y = Math.max(0, phaseStep) * 0.06
        slipper.rotation.x = -Math.max(0, phaseStep) * 0.3
      })

      // Hair: lower locks lag the head's turn, wave in the air, and stream back as she walks.
          locks.forEach(({ tube, spec, points }) => {
        points.forEach((p, j) => {
          const base = spec.base[j], f = yawFraction[j] * yaw, c = Math.cos(f), s = Math.sin(f), reach = j / (LOCK_POINTS - 1)
          const dz0 = base.z - PIVOT.z
          p.set(base.x * c - dz0 * s, base.y, PIVOT.z + base.x * s + dz0 * c)
          p.x += Math.sin(time * 1.3 + spec.phase + j * 0.9) * 0.032 * reach * spec.drift * (walking ? 1.7 : 1)
          p.z += Math.sin(time * 1.0 + spec.phase * 1.3 + j * 0.8) * 0.026 * reach * spec.drift - (walking ? 0.07 * reach : 0) + step * 0.035 * reach
          p.y -= Math.abs(step) * 0.009 * j
        })
        tube.shape(points, normals)
      })

      // Arms: hands clasped at the waist when still; they relax and swing a little when walking.
      const open = walking ? 1 : 0
      arms.forEach(({ side, tube, hand }) => {
        const swing = step * 0.3 * (side > 0 ? 1 : -1)
        shoulder.copy(SHOULDER(side))
        restElbow.set(side * clasped.elbow.x, clasped.elbow.y - open * 0.1, clasped.elbow.z - open * 0.04)
        restWrist.set(side * lerp(clasped.wrist.x, 0.3, open), lerp(clasped.wrist.y, 1.2, open), lerp(clasped.wrist.z, 0.2, open))
        upper.copy(restElbow).sub(shoulder); rotX(upper, swing * 0.8, upper); elbow.copy(shoulder).add(upper)
        fore.copy(restWrist).sub(restElbow); rotX(fore, swing * 1.4, fore); wrist.copy(elbow).add(fore)
        dir.copy(wrist).sub(elbow).normalize()
        tube.shape([shoulder, elbow, wrist, tip.copy(wrist).addScaledVector(dir, 0.03)], normals)
        hand.position.copy(wrist)
        hand.quaternion.setFromUnitVectors(forward, dir).multiply(handRoll.setFromAxisAngle(forward, side * (open ? 0.2 : -0.5)))
      })
    },
  }
  princess.update(0, false)
  return princess
}
