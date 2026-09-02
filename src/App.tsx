import { Suspense, lazy } from 'react'
import { CityCanvas } from '@/scene/CityCanvas'
import { Hud } from '@/ui/Hud'

// The visual editor exists only in dev builds — `import.meta.env.DEV` is
// statically replaced, so production never ships or requests this chunk.
const EditorOverlay = import.meta.env.DEV
  ? lazy(() => import('@/editor/EditorOverlay'))
  : null

export default function App() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-200 font-sans text-slate-800">
      <CityCanvas />
      <Hud />
      {EditorOverlay && (
        <Suspense fallback={null}>
          <EditorOverlay />
        </Suspense>
      )}
    </div>
  )
}
