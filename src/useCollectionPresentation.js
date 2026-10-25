import { useEffect, useState } from 'react'

const snapshot = (run) => ({ runId: run.runId, xp: run.xp, collectedIds: run.collectedIds, checkpoint: run.checkpoint })
// Delay only what the HUD shows. The reducer commits progress immediately and exactly once.
export function useCollectionPresentation(run) {
  const { runId, xp, collectedIds, checkpoint } = run
  const [shown, setShown] = useState(() => snapshot(run))
  const pending = shown.runId === run.runId && run.collectedIds.length > shown.collectedIds.length
  useEffect(() => {
    if (shown.runId === runId && shown.xp === xp && shown.checkpoint === checkpoint) return
    const timer = setTimeout(() => setShown({ runId, xp, collectedIds, checkpoint }), pending ? 520 : 0)
    return () => clearTimeout(timer)
  }, [runId, xp, collectedIds, checkpoint, pending, shown.runId, shown.xp, shown.checkpoint])
  return { ...(pending ? shown : snapshot(run)), collecting: pending }
}
