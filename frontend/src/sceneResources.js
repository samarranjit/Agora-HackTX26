// Each scene owns its resources. Sets protect geometries/materials shared by instances.
export function disposeScene(root) {
  const geometries = new Set()
  const materials = new Set()
  const textures = new Set()
  root.traverse((node) => {
    node.userData.ownedMaterials?.forEach((material) => materials.add(material))
    if (node.geometry) geometries.add(node.geometry)
    if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => materials.add(material))
    if (node.isLight) node.shadow?.dispose()
    if (node.isInstancedMesh) node.dispose()
  })
  materials.forEach((material) => {
    Object.values(material).forEach((value) => { if (value?.isTexture) textures.add(value) })
    material.dispose()
  })
  textures.forEach((texture) => texture.dispose())
  geometries.forEach((geometry) => geometry.dispose())
}
