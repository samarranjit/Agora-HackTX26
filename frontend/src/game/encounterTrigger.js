// A presentation latch, never a source of victory/progression. A failed/closed
// encounter can be approached again only after leaving its proximity zone.
export function createEncounterTrigger() {
  let nearby = null, fired = false
  return {
    update(target, eligible) {
      if (target !== nearby) { nearby = target; fired = false }
      if (!target || !eligible || fired) return null
      fired = true
      return target
    },
  }
}
