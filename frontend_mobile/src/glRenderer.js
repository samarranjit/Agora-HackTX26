import * as THREE from 'three'

// Mobile GPUs share bandwidth with the UI; the storybook scenes stay crisp at 1024.
const MOBILE_SHADOW_SIZE = 1024

// Creates a three.js renderer on an expo-gl context. expo-gl has no DOM canvas, so a
// minimal stand-in carries the drawing-buffer size and ignores DOM listeners.
export function createGLRenderer(gl) {
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight
  const canvas = {
    width, height, clientWidth: width, clientHeight: height, style: {},
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getContext: () => gl,
  }
  // expo-gl implements only the pixel-store flags that native GL understands.
  const pixelStorei = gl.pixelStorei.bind(gl)
  gl.pixelStorei = (name, value) => {
    if (name === gl.UNPACK_FLIP_Y_WEBGL || name === gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL || name === gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) return
    pixelStorei(name, value)
  }
  if (!gl.supportsWebGL2) throw new Error('This device does not support OpenGL ES 3, which the 3D world needs.')
  // expo-gl makes WebGL2RenderingContext inherit from WebGLRenderingContext, so three's
  // WebGL1 guard would reject a valid WebGL2 context. Hide the stub during that check.
  const webgl1 = globalThis.WebGLRenderingContext
  let renderer
  globalThis.WebGLRenderingContext = undefined
  try { renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, powerPreference: 'high-performance' }) }
  finally { globalThis.WebGLRenderingContext = webgl1 }
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  return { renderer, width, height }
}

export function tuneSceneForMobile(scene) {
  scene.traverse((node) => {
    if (node.isLight && node.castShadow && node.shadow?.mapSize.x > MOBILE_SHADOW_SIZE) node.shadow.mapSize.set(MOBILE_SHADOW_SIZE, MOBILE_SHADOW_SIZE)
  })
}
