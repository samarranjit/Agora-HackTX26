import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Shared building blocks for the detailed storybook characters (the dragon, the princess):
// vertex-coloured parts merged into few meshes, and elliptical tubes that follow a path and
// can be re-laid every frame to bend, sway and flap. +z is forward, +y is up.

export const { clamp } = THREE.MathUtils
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
export const hex = (value) => new THREE.Color(value)

export function ramp(stops, x, out) {
  if (x <= stops[0][0]) return out.copy(stops[0][1])
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) return out.copy(stops[i - 1][1]).lerp(stops[i][1], (x - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]))
  }
  return out.copy(stops[stops.length - 1][1])
}

// ---------- Merged static parts ----------

export function bake(source, matrix, colorOf) {
  const g = source.index ? source.toNonIndexed() : source.clone()
  g.deleteAttribute('uv')
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) { colorOf(pos.getX(i), pos.getY(i), pos.getZ(i), c); colors.set([c.r, c.g, c.b], i * 3) }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.applyMatrix4(matrix)
  return g
}

export function createPart() {
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
    // `smooth` welds shared vertices so the surface shades smoothly instead of faceted.
    build(material, name, { smooth: welded = false } = {}) {
      let merged = mergeGeometries(geometries, false)
      if (welded) merged = mergeVertices(merged, 1e-4)
      merged.computeVertexNormals()
      geometries.forEach((g) => g.dispose())
      const mesh = new THREE.Mesh(merged, material)
      mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true
      return mesh
    },
  }
}

// ---------- Lofted tubes ----------

// Whether a spike's faces, wound apex-first through its base points in order, point away from
// its centre. Worked out once in a reference frame (tangent +z, normal +y, binormal -x).
const FRAME = { T: V(0, 0, 1), N: V(0, 1, 0), B: V(-1, 0, 0) }
function spikeFacesOut(sp) {
  const { T, N, B } = FRAME, w = 1, h = 1
  let apex, b1, b2, b3
  if (sp.axis === 'T') {
    apex = T.clone().multiplyScalar(h); b1 = N.clone().multiplyScalar(w)
    b2 = N.clone().multiplyScalar(-w * 0.5).addScaledVector(B, w * 0.87); b3 = N.clone().multiplyScalar(-w * 0.5).addScaledVector(B, -w * 0.87)
  } else {
    const sign = sp.axis.startsWith('-') ? -1 : 1, onB = sp.axis.endsWith('B')
    const axis = (onB ? B : N).clone().multiplyScalar(sign), side = onB ? N : B
    apex = axis.clone().multiplyScalar(h).addScaledVector(T, -h * sp.sweep)
    b1 = side.clone().multiplyScalar(w).addScaledVector(T, w * 0.7); b2 = side.clone().multiplyScalar(-w).addScaledVector(T, w * 0.7); b3 = T.clone().multiplyScalar(-w * 1.2)
  }
  const normal = b1.clone().sub(apex).cross(b2.clone().sub(apex))
  return normal.dot(b3.clone().sub(apex)) < 0
}

// A tube of elliptical rings along a path, with optional spines. `shape(points)` lays
// the vertices along a new path, so the same tube serves fixed and bending parts.
export function createTube({ rings, sides, rx, ry, color, spikes = [], reference }) {
  const ringTotal = rings + 1, body = ringTotal * sides, total = body + spikes.length * 4
  const positions = new Float32Array(total * 3), colors = new Float32Array(total * 3), normals = new Float32Array(total * 3)
  const index = []
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * sides + s, b = r * sides + (s + 1) % sides, c = (r + 1) * sides + s, d = (r + 1) * sides + (s + 1) % sides
      index.push(a, b, c, b, d, c) // wound so the faces point away from the tube's axis
    }
  }
  const tint = new THREE.Color()
  for (let r = 0; r < ringTotal; r++) {
    for (let s = 0; s < sides; s++) { color(r / rings, Math.cos(s / sides * Math.PI * 2), tint); colors.set([tint.r, tint.g, tint.b], (r * sides + s) * 3) }
  }
  spikes.forEach((sp, k) => {
    const first = body + k * 4
    // Which way round the three faces must be wound depends on the way the spike points.
    if (spikeFacesOut(sp)) index.push(first, first + 1, first + 2, first, first + 2, first + 3, first, first + 3, first + 1)
    else index.push(first, first + 2, first + 1, first, first + 3, first + 2, first, first + 1, first + 3)
    colors.set([sp.tip.r, sp.tip.g, sp.tip.b], first * 3)
    for (let n = 1; n < 4; n++) colors.set([sp.base.r, sp.base.g, sp.base.b], (first + n) * 3)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setIndex(index)
  const frames = Array.from({ length: ringTotal }, () => ({ P: V(), T: V(), N: V(), B: V() }))
  const q = new THREE.Quaternion(), dorsal = reference ? reference.clone() : V(0, 1, 0), axis = V(), apex = V(), point = V()
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

export const profile = (rings, fn) => Float32Array.from({ length: rings + 1 }, (_, i) => fn(i / rings))
export const bump = (x, centre, width) => Math.exp(-(((x - centre) / width) ** 2))

// A parametric surface: `cols` around by `rows` along. `lay(fn)` places every vertex with
// fn(u, v, out), where u and v run from 0 to 1, and can be called again each frame.
export function createGrid({ cols, rows, color, flip = false }) {
  const stride = rows + 1, total = (cols + 1) * stride
  const positions = new Float32Array(total * 3), colors = new Float32Array(total * 3), normals = new Float32Array(total * 3)
  const index = []
  const tint = new THREE.Color()
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r <= rows; r++) {
      color(c / cols, r / rows, tint)
      colors.set([tint.r, tint.g, tint.b], (c * stride + r) * 3)
      if (c < cols && r < rows) {
        const a = c * stride + r, b = a + stride, d = a + 1, e = b + 1
        if (flip) index.push(a, d, b, d, e, b)
        else index.push(a, b, d, d, b, e)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setIndex(index)
  const spot = new THREE.Vector3()
  return {
    geometry,
    lay(fn, withNormals = true) {
      for (let c = 0; c <= cols; c++) {
        for (let r = 0; r <= rows; r++) {
          fn(c / cols, r / rows, spot)
          positions.set([spot.x, spot.y, spot.z], (c * stride + r) * 3)
        }
      }
      geometry.attributes.position.needsUpdate = true
      if (withNormals) geometry.computeVertexNormals()
    },
  }
}

// Emission that follows the vertex colours: parts glow in their own hues, even in shadow.
export function glowByColor(material, key) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;')
  }
  material.customProgramCacheKey = () => key
}
