import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { mdRawById, parsePlaceMd } from '@/city/load'
import { CityConfigSchema } from '@/city/schema'
import type { MdPayload, Place, Zone } from '@/city/schema'
import { useCityStore } from '@/state/store'
import { BUILDING_KINDS } from '@/scene/archetypes'
import type { BuildingKind } from '@/scene/archetypes'
import { ColorInput, Field, inputCls, NumberInput, SelectInput, TextInput } from './fields'
import {
  buildingLabel,
  editorShared,
  findFreeZoneSpot,
  pickZoneColor,
  round1,
  SNAP_OPTIONS,
  uniqueId,
} from './editorShared'
import { buildInitialDrafts, normalizeMd, seedMdDraft } from './mdDrafts'
import { toConfig } from './toConfig'

/**
 * Dev-only DOM layer for the visual city editor, mounted next to the HUD.
 *
 * Closed: a single floating "Edit city" button. Open: a right-side dock with
 * three tabs — Layout (position/rotation/scale of the selected place, zone
 * geometry), Content (markdown drafts for the selected place or the plaza's
 * about page) and City (meta) — plus a sticky save bar that POSTs the draft to
 * /__city/save, which rewrites src/city/city.json and the place .md files so
 * the changes land as ordinary git diffs.
 *
 * 3D interactions (grabbing buildings / zone anchor discs) live in DragLayer
 * inside the Canvas; the two share drag-relevant knobs through editorShared.
 */

type Tab = 'layout' | 'content' | 'city'

/* --------------------------------------------------------------------------
 * Styling tokens (white glass + slate text + amber "workshop" accents)
 * ------------------------------------------------------------------------ */

const tabBtnClass = (active: boolean) =>
  `cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
    active
      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
      : 'text-slate-500 hover:text-slate-800'
  }`

const btnClass =
  'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50'

const ghostBtn = `${btnClass} bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:bg-white hover:text-slate-900`
const addBtn = `${btnClass} bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100`
const dangerBtn = `${btnClass} bg-rose-50 text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100 hover:text-rose-700`
const saveBtn = `${btnClass} w-full bg-amber-500 py-2 text-sm text-white shadow-sm hover:bg-amber-600`
const stepBtn =
  'flex h-[30px] w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white/80 text-sm text-slate-500 ring-1 ring-slate-200 hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'
const removeBtn =
  'flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'

const miniLabel =
  'text-[11px] font-semibold uppercase tracking-wide text-slate-400'

/** Minimal markdown preview styling (no typography plugin). */
const previewCls =
  'px-3 pb-3 text-sm leading-relaxed text-slate-700 [&_a]:text-amber-600 [&_a]:underline [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-slate-800 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-slate-800 [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-slate-800 [&_img]:my-2 [&_img]:max-h-40 [&_img]:rounded-lg [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1.5 [&_strong]:text-slate-900 [&_ul]:my-1.5 [&_ul]:list-inside'

/** Don't hijack keys while the user is typing in a field. */
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  )
}

/* --------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------ */

export default function EditorOverlay() {
  const editing = useCityStore((s) => s.editing)
  const city = useCityStore((s) => s.city)
  const selectedId = useCityStore((s) => s.selectedId)
  const dirty = useCityStore((s) => s.dirty)
  const saving = useCityStore((s) => s.saving)
  const saveError = useCityStore((s) => s.saveError)
  const updateCity = useCityStore((s) => s.updateCity)
  const select = useCityStore((s) => s.select)

  const [tab, setTab] = useState<Tab>('layout')
  /** Mirror of editorShared.snap so the select re-renders. */
  const [snap, setSnap] = useState(editorShared.snap)
  const [justSaved, setJustSaved] = useState(false)

  // Markdown drafts, seeded from disk when an edit session starts. The pristine
  // snapshot they are diffed against at save time lives in a ref (not state —
  // it must never trigger re-renders).
  const [drafts, setDrafts] = useState<Record<string, MdPayload>>({})
  const initialDraftsRef = useRef<Record<string, MdPayload>>({})

  useEffect(() => {
    if (!editing) return
    const snapshot = buildInitialDrafts(useCityStore.getState().baseCity)
    initialDraftsRef.current = snapshot
    setDrafts({ ...snapshot })
    setTab('layout')
    setJustSaved(false)
  }, [editing])

  // Any fresh edit clears the "Saved ✓" flash.
  useEffect(() => {
    if (dirty) setJustSaved(false)
  }, [dirty])

  /* --- selection helpers ------------------------------------------------- */

  const place = selectedId ? (city.places.find((p) => p.id === selectedId) ?? null) : null
  const zone = !place && selectedId ? (city.zones.find((z) => z.id === selectedId) ?? null) : null
  const isPlazaContent = selectedId !== null && selectedId === city.plaza.contentId
  const contentId = place ? place.id : isPlazaContent ? city.plaza.contentId : null

  const updatePlace = (id: string, mutate: (p: Place) => void) =>
    updateCity((draft) => {
      const target = draft.places.find((p) => p.id === id)
      if (target) mutate(target)
    })

  const updateZone = (id: string, mutate: (z: Zone) => void) =>
    updateCity((draft) => {
      const target = draft.zones.find((z) => z.id === id)
      if (target) mutate(target)
    })

  /* --- place actions ------------------------------------------------------ */

  const allPlaceIds = city.places.map((p) => p.id)

  const addPlace = () => {
    const targetZone =
      city.zones.find((z) => z.id === place?.zone) ??
      city.zones.find((z) => z.id === zone?.id) ??
      city.zones[0]
    if (!targetZone) return
    const id = uniqueId('new-place', '', allPlaceIds)
    const newPlace: Place = {
      id,
      zone: targetZone.id,
      name: 'New Place',
      building: 'house',
      position: [round1(targetZone.position[0] + 5), round1(targetZone.position[1] + 5)],
      rotationY: 0,
      scale: 1,
    }
    updateCity((draft) => {
      draft.places.push({ ...newPlace, content: null })
    })
    setDrafts((prev) => ({ ...prev, [id]: seedMdDraft(newPlace.name) }))
    select(id)
  }

  const duplicatePlace = () => {
    if (!place) return
    const id = uniqueId(place.id, '-copy', allPlaceIds)
    const copy: Place = {
      id,
      zone: place.zone,
      name: place.name.length + 5 <= 80 ? `${place.name} copy` : place.name,
      subtitle: place.subtitle,
      building: place.building,
      position: [round1(place.position[0] + 4), round1(place.position[1] + 4)],
      rotationY: place.rotationY,
      scale: place.scale,
      label: place.label,
    }
    updateCity((draft) => {
      draft.places.push({ ...copy, content: null })
    })
    // Carry the story over so the duplicate is a true copy (including md).
    const sourceDraft = drafts[place.id] ?? { body: '', links: [] }
    setDrafts((prev) => ({ ...prev, [id]: normalizeMd(sourceDraft) }))
    select(id)
  }

  const deletePlace = () => {
    if (!place) return
    if (!confirm(`Delete place "${place.name}"? It is removed from city.json on the next save.`))
      return
    const id = place.id
    updateCity((draft) => {
      draft.places = draft.places.filter((p) => p.id !== id)
    })
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    select(null)
  }

  /* --- zone actions ------------------------------------------------------- */

  const addZone = () => {
    const id = uniqueId('zone', '-', city.zones.map((z) => z.id))
    const newZone: Zone = {
      id,
      name: 'New Zone',
      position: findFreeZoneSpot(city.zones),
      radius: 12,
      color: pickZoneColor(
        city.zones.map((z) => z.color),
        city.zones.length,
      ),
    }
    updateCity((draft) => {
      draft.zones.push(newZone)
    })
    select(id)
  }

  /* --- markdown drafts ---------------------------------------------------- */

  const patchDraft = (id: string, patch: Partial<MdPayload>) =>
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { body: '', links: [] }), ...patch },
    }))

  /* --- save ---------------------------------------------------------------- */

  const save = async () => {
    const store = useCityStore.getState()
    if (store.saving || !store.editing) return
    store.setSaving(true)
    store.setSaveError(null)
    try {
      // 1. Client-side validation with the exact schema the app loads with.
      const parsed = CityConfigSchema.safeParse(toConfig(store.city))
      if (!parsed.success) {
        store.setSaveError(
          parsed.error.issues.map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          ),
        )
        return
      }

      // 2. Only md drafts that actually differ from the on-disk snapshot.
      const initial = initialDraftsRef.current
      const md: Record<string, MdPayload> = {}
      for (const [id, draft] of Object.entries(drafts)) {
        const normalized = normalizeMd(draft)
        if (JSON.stringify(normalized) !== JSON.stringify(initial[id])) {
          md[id] = normalized
        }
      }

      // 3. POST to the dev middleware, which rewrites city.json + the md files.
      const res = await fetch('/__city/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: parsed.data, md }),
      })
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; errors?: string[] }
        | null

      if (res.ok && body?.ok) {
        useCityStore.getState().markSaved()
        setJustSaved(true)
        // Vite detects the rewritten json/md modules and full-reloads the page;
        // the timer just clears the flash if nothing actually changed on disk.
        window.setTimeout(() => setJustSaved(false), 6000)
      } else {
        useCityStore
          .getState()
          .setSaveError(body?.errors ?? [`Save failed (HTTP ${res.status})`])
      }
    } catch (err) {
      useCityStore
        .getState()
        .setSaveError([err instanceof Error ? err.message : String(err)])
    } finally {
      useCityStore.getState().setSaving(false)
    }
  }

  // Keep the keyboard handler's save reference fresh without re-binding.
  const saveRef = useRef<() => Promise<void>>(save)
  useEffect(() => {
    saveRef.current = save
  })

  /* --- keyboard: `e` toggles edit mode, Cmd/Ctrl+S saves ------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const store = useCityStore.getState()

      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
        if (!store.editing) return
        event.preventDefault()
        void saveRef.current()
        return
      }

      if (isEditableTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return

      if (event.key === 'e' || event.key === 'E') {
        if (store.editing) store.exitEdit()
        else store.enterEdit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /* --- closed: floating edit button (hidden while the story panel occupies the corner) --- */

  const panelOpen = useCityStore((s) => s.panelOpen)
  if (!editing) {
    if (panelOpen) return null
    return (
      <button
        type="button"
        onClick={() => useCityStore.getState().enterEdit()}
        className="panel-glass fixed bottom-4 right-4 z-40 flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:scale-105 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        ✏️ Edit city
      </button>
    )
  }

  /* --- open: the dock ------------------------------------------------------- */

  return (
    <aside
      aria-label="City editor"
      className="panel-glass fixed inset-y-0 right-0 z-50 flex w-full flex-col rounded-none sm:w-[380px] sm:rounded-l-2xl"
    >
      {/* header */}
      <header className="flex items-center justify-between gap-2 border-b border-white/70 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-800">City Editor</h2>
          {dirty && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-300">
              Unsaved changes
            </span>
          )}
        </div>
        <button
          type="button"
          className={ghostBtn}
          onClick={() => useCityStore.getState().exitEdit()}
        >
          Done
        </button>
      </header>

      {/* tabs */}
      <div className="flex gap-1 border-b border-white/70 px-3 py-2" role="tablist">
        {(['layout', 'content', 'city'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tabBtnClass(tab === t)}
            onClick={() => setTab(t)}
          >
            {t === 'layout' ? 'Layout' : t === 'content' ? 'Content' : 'City'}
          </button>
        ))}
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* ============================== LAYOUT ============================== */}
        {tab === 'layout' && (
          <div>
            {place ? (
              <div className="space-y-3">
                <p className="font-mono text-[11px] text-slate-400">id: {place.id}</p>
                <Field label="Name">
                  <TextInput
                    value={place.name}
                    maxLength={80}
                    onChange={(v) => updatePlace(place.id, (p) => void (p.name = v))}
                  />
                </Field>
                <Field label="Subtitle">
                  <TextInput
                    value={place.subtitle ?? ''}
                    maxLength={120}
                    placeholder="Role / degree / one-liner (optional)"
                    onChange={(v) =>
                      updatePlace(place.id, (p) => void (p.subtitle = v === '' ? undefined : v))
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Zone">
                    <SelectInput
                      value={place.zone}
                      options={city.zones.map((z) => ({ value: z.id, label: z.name }))}
                      onChange={(v) => updatePlace(place.id, (p) => void (p.zone = v))}
                    />
                  </Field>
                  <Field label="Building">
                    <SelectInput
                      value={place.building}
                      options={BUILDING_KINDS.map((kind) => ({
                        value: kind,
                        label: buildingLabel(kind),
                      }))}
                      onChange={(v) =>
                        updatePlace(place.id, (p) => void (p.building = v as BuildingKind))
                      }
                    />
                  </Field>
                </div>
                <Field label="Label chip">
                  <TextInput
                    value={place.label ?? ''}
                    maxLength={40}
                    placeholder="e.g. 2021 — 2025 (optional)"
                    onChange={(v) =>
                      updatePlace(place.id, (p) => void (p.label = v === '' ? undefined : v))
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Rotation Y">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className={stepBtn}
                        aria-label="Rotate −0.1 radians"
                        onClick={() =>
                          updatePlace(place.id, (p) => void (p.rotationY = round1(p.rotationY - 0.1)))
                        }
                      >
                        −
                      </button>
                      <NumberInput
                        value={place.rotationY}
                        step={0.1}
                        onCommit={(v) => updatePlace(place.id, (p) => void (p.rotationY = v))}
                      />
                      <button
                        type="button"
                        className={stepBtn}
                        aria-label="Rotate +0.1 radians"
                        onClick={() =>
                          updatePlace(place.id, (p) => void (p.rotationY = round1(p.rotationY + 0.1)))
                        }
                      >
                        ＋
                      </button>
                    </div>
                  </Field>
                  <Field label={`Scale · ${place.scale.toFixed(2)}×`}>
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      value={place.scale}
                      aria-label="Scale"
                      onChange={(event) =>
                        updatePlace(
                          place.id,
                          (p) => void (p.scale = Math.round(Number(event.target.value) * 100) / 100),
                        )
                      }
                      className="mt-2 w-full cursor-pointer accent-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    />
                  </Field>
                </div>

                {/* position readout + shared drag snap */}
                <div className="rounded-xl bg-white/60 p-2.5 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className={miniLabel}>Position</span>
                    <span className="font-mono text-xs text-slate-600">
                      [{round1(place.position[0])}, {round1(place.position[1])}]
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      Drag the building in the 3D view to move it.
                    </span>
                    <div className="flex w-24 shrink-0 items-center gap-1.5">
                      <span className={miniLabel}>Snap</span>
                      <SelectInput
                        value={String(snap)}
                        options={SNAP_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                        onChange={(v) => {
                          const next = Number(v) as 0 | 0.5 | 1
                          editorShared.snap = next
                          setSnap(next)
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" className={ghostBtn} onClick={duplicatePlace}>
                    ⧉ Duplicate
                  </button>
                  <button type="button" className={dangerBtn} onClick={deletePlace}>
                    🗑 Delete place
                  </button>
                </div>
              </div>
            ) : zone ? (
              <div className="space-y-3">
                <p className="font-mono text-[11px] text-slate-400">id: {zone.id}</p>
                <Field label="Name">
                  <TextInput
                    value={zone.name}
                    maxLength={60}
                    onChange={(v) => updateZone(zone.id, (z) => void (z.name = v))}
                  />
                </Field>
                <Field label="Blurb">
                  <TextInput
                    value={zone.blurb ?? ''}
                    maxLength={160}
                    placeholder="One-line description (optional)"
                    onChange={(v) =>
                      updateZone(zone.id, (z) => void (z.blurb = v === '' ? undefined : v))
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Radius">
                    <NumberInput
                      value={zone.radius}
                      min={6}
                      max={40}
                      step={1}
                      onCommit={(v) => updateZone(zone.id, (z) => void (z.radius = v))}
                    />
                  </Field>
                  <Field label="Color">
                    <ColorInput
                      value={zone.color}
                      onChange={(v) => updateZone(zone.id, (z) => void (z.color = v))}
                    />
                  </Field>
                </div>
                <div className="rounded-xl bg-white/60 p-2.5 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className={miniLabel}>Position</span>
                    <span className="font-mono text-xs text-slate-600">
                      [{round1(zone.position[0])}, {round1(zone.position[1])}]
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Drag the anchor disc in the 3D view to move this district.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Click a building to select it. Drag buildings to move them.
              </p>
            )}

            {/* always-visible add actions */}
            <div className="mt-4 border-t border-slate-200/70 pt-3">
              <span className={miniLabel}>Add</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button type="button" className={addBtn} onClick={addPlace}>
                  ＋ Add place
                </button>
                <button type="button" className={addBtn} onClick={addZone}>
                  ＋ Add zone
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================== CONTENT ============================= */}
        {tab === 'content' &&
          (contentId ? (
            <ContentEditor
              key={contentId}
              contentId={contentId}
              title={isPlazaContent ? `Plaza — ${city.plaza.contentId}` : (place?.name ?? contentId)}
              draft={drafts[contentId] ?? normalizeMd(parsePlaceMd(mdRawById[contentId] ?? ''))}
              patch={(patch) => patchDraft(contentId, patch)}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                Select a place to edit its story — click a building in the 3D view or pick one in
                the Layout tab.
              </p>
              <button
                type="button"
                className={addBtn}
                onClick={() => select(city.plaza.contentId)}
              >
                ＋ Edit the plaza “about” page
              </button>
            </div>
          ))}

        {/* =============================== CITY =============================== */}
        {tab === 'city' && (
          <div className="space-y-3">
            <Field label="City name">
              <TextInput
                value={city.meta.cityName}
                maxLength={60}
                onChange={(v) => updateCity((draft) => void (draft.meta.cityName = v))}
              />
            </Field>
            <Field label="Tagline">
              <TextInput
                value={city.meta.tagline}
                maxLength={140}
                onChange={(v) => updateCity((draft) => void (draft.meta.tagline = v))}
              />
            </Field>
            <Field label="Resume URL">
              <TextInput
                value={city.meta.resumeUrl ?? ''}
                type="url"
                placeholder="https://… (optional)"
                onChange={(v) =>
                  updateCity((draft) => void (draft.meta.resumeUrl = v === '' ? undefined : v))
                }
              />
            </Field>
          </div>
        )}
      </div>

      {/* sticky save bar */}
      <footer className="border-t border-white/70 px-4 py-3">
        {saveError && saveError.length > 0 && (
          <ul className="mb-2 space-y-1 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 ring-1 ring-rose-200">
            {saveError.map((error) => (
              <li key={error}>✖ {error}</li>
            ))}
          </ul>
        )}
        {justSaved && !dirty && (
          <p className="mb-2 text-center text-xs font-semibold text-emerald-600">
            Saved ✓ — reloading…
          </p>
        )}
        <button type="button" className={saveBtn} disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save to files'}
        </button>
        <p className="mt-1.5 text-center text-[11px] text-slate-400">
          Writes src/city/city.json + place markdown · ⌘S
        </p>
      </footer>
    </aside>
  )
}

/* --------------------------------------------------------------------------
 * Content tab: markdown editor for one place (or the plaza about page)
 * ------------------------------------------------------------------------ */

function ContentEditor({
  contentId,
  title,
  draft,
  patch,
}: {
  contentId: string
  title: string
  draft: MdPayload
  patch: (patch: Partial<MdPayload>) => void
}) {
  const links = draft.links ?? []

  const setLink = (index: number, next: { label: string; url: string }) =>
    patch({ links: links.map((link, i) => (i === index ? next : link)) })

  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[11px] text-slate-400">id: {contentId}</p>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
      </div>

      <Field label="Period">
        <TextInput
          value={draft.period ?? ''}
          maxLength={40}
          placeholder="e.g. 2021 — 2025 (optional)"
          onChange={(v) => patch({ period: v })}
        />
      </Field>

      <div>
        <span className={`mb-1 block ${miniLabel}`}>Links</span>
        <div className="space-y-1.5">
          {links.map((link, i) => (
            <div key={i} className="flex gap-1.5">
              <TextInput
                value={link.label}
                placeholder="Label"
                onChange={(v) => setLink(i, { ...link, label: v })}
                className="flex-1"
              />
              <TextInput
                value={link.url}
                placeholder="https://…"
                onChange={(v) => setLink(i, { ...link, url: v })}
                className="flex-[1.4]"
              />
              <button
                type="button"
                className={removeBtn}
                aria-label={`Remove link ${i + 1}`}
                onClick={() => patch({ links: links.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={`${addBtn} mt-1.5`}
          onClick={() => patch({ links: [...links, { label: '', url: '' }] })}
        >
          ＋ Add link
        </button>
      </div>

      <Field label="Body (markdown)">
        <textarea
          rows={14}
          spellCheck={false}
          value={draft.body}
          onChange={(event) => patch({ body: event.target.value })}
          className={`${inputCls} font-mono text-xs leading-relaxed`}
        />
      </Field>

      <details className="rounded-xl bg-white/60 ring-1 ring-slate-200">
        <summary
          className={`cursor-pointer select-none px-3 py-2 ${miniLabel} hover:text-slate-600`}
        >
          Live preview
        </summary>
        <div className={previewCls}>
          <Markdown remarkPlugins={[remarkGfm]}>{draft.body}</Markdown>
        </div>
      </details>
    </div>
  )
}
