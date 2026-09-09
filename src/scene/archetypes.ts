/**
 * Building archetype registry — the shared vocabulary between the scene,
 * the config schema and the editor's building-type dropdown.
 *
 * `radius` is the circular footprint used for hover/collision/camera framing,
 * `height` the visual height used to aim the camera.
 */
export const BUILDING_SPECS = {
  house: { radius: 3.2, height: 5 },
  tower: { radius: 3.4, height: 16 },
  campus: { radius: 6.5, height: 9 },
  workshop: { radius: 4.5, height: 6.5 },
  harbor: { radius: 6.0, height: 10 },
  billboard: { radius: 3.0, height: 8 },
  monument: { radius: 2.6, height: 9 },
  radio: { radius: 3.0, height: 15 },
  postoffice: { radius: 4.0, height: 6.5 },
  hall: { radius: 5.0, height: 7 },
  startup: { radius: 3.6, height: 7.5 },
  lab: { radius: 4.2, height: 6 },
  greenhouse: { radius: 4.5, height: 6.2 },
} as const satisfies Record<string, { radius: number; height: number }>

export type BuildingKind = keyof typeof BUILDING_SPECS

export const BUILDING_KINDS = Object.keys(BUILDING_SPECS) as BuildingKind[]

export const getFootprint = (kind: BuildingKind): { radius: number; height: number } =>
  BUILDING_SPECS[kind]
