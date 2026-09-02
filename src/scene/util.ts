import { Color } from 'three'

/**
 * Shared scene helpers: deterministic RNG + palette math. Everything visual
 * derives from these so the city renders identically on every load.
 */

/** FNV-1a hash — turns a place id into a stable numeric seed. */
export function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Mulberry32 — tiny fast seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]
}

const WHITE = new Color('#ffffff')
const BLACK = new Color('#000000')

/**
 * Tint a hex color: positive `amount` mixes toward white (pastel),
 * negative mixes toward black (shade). Returns `#rrggbb`.
 */
export function shade(hex: string, amount: number): string {
  const c = new Color(hex)
  c.lerp(amount >= 0 ? WHITE : BLACK, Math.abs(amount))
  return `#${c.getHexString()}`
}

/** Interpolate between two hex colors (t in [0,1]). */
export function mixHex(a: string, b: string, t: number): string {
  const c = new Color(a)
  c.lerp(new Color(b), t)
  return `#${c.getHexString()}`
}

/** Shared low-poly building palette. */
export const PALETTE = {
  walls: '#f5efe1',
  wallsAlt: '#eae2cf',
  wood: '#b58a5f',
  woodDark: '#93704e',
  window: '#bfe0ee',
  stone: '#d9cfc0',
  metal: '#9aa3ad',
  white: '#f7f2e6',
  gold: '#f2c14e',
} as const
