// Deterministic randomness for the simulation layer.
//
// Math.random() is banned everywhere under scripts/sim/** (tests/sim/no-clock.test.ts
// enforces it) because a backtest that cannot be replayed byte-for-byte from
// (fixture, seed) is not evidence of anything. Every stochastic choice in the
// corpus generator and every sampling choice in the harness comes from here.

export type Rng = () => number

// mulberry32 — small, fast, well-distributed 32-bit PRNG. Chosen over a crypto
// source precisely because it is reproducible from an integer seed.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// FNV-1a, 32-bit. Turns a corpus id / property id into a seed integer.
export function seedFromString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Fisher-Yates over a copy — the caller's array is never mutated.
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Deterministic fit/holdout split.
//
// Assignment is a pure function of (id, seed) — NOT of position in the array or of
// a PRNG walked in input order. That matters: it means adding a property to the
// corpus does not reshuffle which side every other property lands on, so a
// calibration number stays comparable across corpus revisions.
export function splitByHash(ids: readonly string[], seed: number): { fit: string[]; holdout: string[] } {
  const fit: string[] = []
  const holdout: string[] = []
  for (const id of ids) {
    const h = seedFromString(`${seed}:${id}`)
    // Use a high bit rather than the low one: FNV-1a's lowest bit is the weakest.
    if ((h >>> 16) % 2 === 0) fit.push(id)
    else holdout.push(id)
  }
  return { fit, holdout }
}
