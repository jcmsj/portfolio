import { create } from 'zustand'
import { cityData, type CityData } from '@/city/load'

/**
 * Global app state. `city` is what the scene renders: the on-disk data, or
 * the editor's draft while a visual-editing session is in progress.
 */

export type Mode = 'orbit' | 'walk'

export interface FocusRequest {
  x: number
  z: number
  /** Monotonic counter so repeated requests to the same spot still fire. */
  nonce: number
}

const HELP_KEY = 'nsj-help-dismissed'

function readHelpDismissed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(HELP_KEY) === '1'
  } catch {
    // Sandboxed iframes / blocked storage — treat as not dismissed.
    return false
  }
}

interface CityStore {
  city: CityData
  baseCity: CityData

  /** Selected place id, or the plaza's contentId for the about panel. */
  selectedId: string | null
  hoveredId: string | null
  mode: Mode
  panelOpen: boolean
  listOpen: boolean
  helpDismissed: boolean
  focusRequest: FocusRequest | null

  // --- editor state (dev only) ---
  editing: boolean
  dirty: boolean
  saving: boolean
  saveError: string[] | null
  /** True while the editor is dragging a place/zone — pauses orbit controls. */
  dragging: boolean

  select: (id: string | null) => void
  setHovered: (id: string | null) => void
  setMode: (mode: Mode) => void
  toggleMode: () => void
  toggleList: () => void
  dismissHelp: () => void
  requestFocus: (x: number, z: number) => void

  enterEdit: () => void
  exitEdit: () => void
  updateCity: (mutate: (draft: CityData) => void) => void
  markSaved: () => void
  setSaving: (saving: boolean) => void
  setSaveError: (errors: string[] | null) => void
  setDragging: (dragging: boolean) => void
  markDirty: () => void
}

export const useCityStore = create<CityStore>()((set, get) => ({
  city: cityData,
  baseCity: cityData,

  selectedId: null,
  hoveredId: null,
  mode: 'orbit',
  panelOpen: false,
  listOpen: false,
  helpDismissed: readHelpDismissed(),
  focusRequest: null,

  editing: false,
  dirty: false,
  saving: false,
  saveError: null,
  dragging: false,

  select: (id) =>
    set((s) => ({
      selectedId: id,
      // While editing, selection drives the inspector, not the content panel.
      panelOpen: !s.editing && id !== null,
      listOpen: false,
    })),
  setHovered: (hoveredId) => set({ hoveredId }),
  setMode: (mode) => set({ mode }),
  toggleMode: () => set((s) => ({ mode: s.mode === 'orbit' ? 'walk' : 'orbit' })),
  toggleList: () => set((s) => ({ listOpen: !s.listOpen, panelOpen: false })),
  dismissHelp: () => {
    try {
      localStorage.setItem(HELP_KEY, '1')
    } catch {
      /* private mode etc. — non-fatal */
    }
    set({ helpDismissed: true })
  },
  requestFocus: (x, z) =>
    set((s) => ({ focusRequest: { x, z, nonce: (s.focusRequest?.nonce ?? 0) + 1 } })),

  enterEdit: () => {
    const draft = structuredClone(get().baseCity)
    set({ editing: true, city: draft, dirty: false, saveError: null, selectedId: null, panelOpen: false })
  },
  exitEdit: () => {
    if (get().dirty && !confirm('Discard unsaved city edits?')) return
    set({ editing: false, city: get().baseCity, dirty: false, saveError: null, selectedId: null, panelOpen: false })
  },
  updateCity: (mutate) => {
    const draft = structuredClone(get().city)
    mutate(draft)
    set({ city: draft, dirty: true })
  },
  markSaved: () => set({ baseCity: get().city, dirty: false, saveError: null }),
  setSaving: (saving) => set({ saving }),
  setSaveError: (saveError) => set({ saveError }),
  setDragging: (dragging) => set({ dragging }),
  markDirty: () => set({ dirty: true }),
}))

/** Find a place by id (or the plaza content place when id === plaza.contentId). */
export function findPlace(city: CityData, id: string | null) {
  if (!id) return null
  return city.places.find((p) => p.id === id) ?? null
}
