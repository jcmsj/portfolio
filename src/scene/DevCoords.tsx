import { useRef } from 'react'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'

/**
 * Dev-only pointer world readout: a transparent plane catches pointer moves
 * and writes x/z straight into a corner chip via ref (no per-move setState).
 * The chip is a drei <Html> pinned to the bottom-left of the viewport;
 * renders nothing in production builds.
 */
export function DevCoords() {
  if (!import.meta.env.DEV) return null
  return <DevCoordsChip />
}

function DevCoordsChip() {
  const chipRef = useRef<HTMLDivElement>(null)

  const onMove = (event: ThreeEvent<PointerEvent>) => {
    const chip = chipRef.current
    if (!chip) return
    chip.textContent = `x ${event.point.x.toFixed(1)}   z ${event.point.z.toFixed(1)}`
  }

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} onPointerMove={onMove}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html
        prepend
        zIndexRange={[5, 0]}
        calculatePosition={() => [12, window.innerHeight - 58] as [number, number]}
      >
        <div
          ref={chipRef}
          style={{
            padding: '2px 8px',
            borderRadius: 8,
            background: 'rgba(15, 23, 42, 0.55)',
            color: '#e2e8f0',
            font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre',
            pointerEvents: 'none',
          }}
        >
          x —   z —
        </div>
      </Html>
    </>
  )
}
