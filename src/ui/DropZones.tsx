import { useStore } from '../store'

/**
 * Where a window being dragged will land if let go — drawn while it is held
 * over an edge, so docking and closing are never a surprise. Shared by the
 * MEDIQ dashboard and blades through the store (see lib/windowDrag.ts).
 */
const LABEL = { left: 'DOCK LEFT', right: 'DOCK RIGHT', close: 'RELEASE TO CLOSE' } as const

export function DropZones() {
  const zone = useStore((s) => s.dropZone)
  if (!zone) return null
  return <div className={`dropzone dropzone-${zone}`}>{LABEL[zone]}</div>
}
