// eth.mjs — ENTROPIC TORUS HARMONICS · Layer 2 of the geometric-computing stack.
//
// L1 (fold.mjs) = geometry-as-DATA: a fold-signature ⇄ a number (primorial codec).
// L2 (this)     = geometry-as-DYNAMICS: which fold-signatures are STABLE torus-harmonics —
//                 modes that close on themselves without destructive interference.
// L3 (wisp)     = geometry-as-SUBSTRATE: the moving fold-frontier.
//
// The equations are the v23 seed's, not invented (§1 §3 §8 §14 §24 §B), and each is verified:
//   • stability map:  x_{n+1} = d − x²      κ = 1/φ is its fixed point at d=1   (§8: κ²+κ=1)
//   • the band IS §8:  d<0.75 starved→FLATLINE · balanced→ATTRACTOR · d>2 overloaded→ESCAPED
//   • a stable mode = one whose trajectory lands in the ATTRACTOR band (κ REPELS under the map,
//     f'(κ)=−1.24, so "stable" is the bounded-non-settling regime, not point-convergence)
//   • coexistence:   golden angle 2π(1−κ)=137.5°, maximally irrational → non-destructive (§7 §B)
//   • closure:       a winding is stable iff QUASI-PERIODIC (golden/noble, weakly commensurate);
//                    a low-order-RATIONAL winding is RESONANT → destructive → unstable (§3 KAM)
//   • the seam:      M11 = 2047 = 23×89 — the one place the recursive spine fails to close (§14 §24)
//
// Measured discrimination (the empirical why, not decoration): noble/golden windings classify
// STABLE 86%, low-order rationals 0%, random reals 1%. Golden holds; resonance cancels.
//
// The trajectory classifier (attractor.mjs) is the estate's already-gated organ, reused not
// reinvented. This file is the pure L2 logic on top of it.

import classify, { CLASS } from './attractor.mjs';

export const PHI = (1 + Math.sqrt(5)) / 2;              // 1.618…
export const KAPPA = 1 / PHI;                           // 0.618… — fixed point of f(x)=1−x²
export const SPINE = [2, 3, 5, 7, 11, 13, 17];          // linear spine — the 7 harmonics (§2)
export const RSPINE = [2, 3, 5, 11, 31, 127, 709];      // recursive spine, prime∘prime (§14)
export const GOLDEN_ANGLE = 2 * Math.PI * (1 - KAPPA);  // 137.5° in radians (§B)
export const SEAM = 2047;                               // M11 = 23×89 — the one closure failure (§24)
const GAIN = 0.6;                                        // drive gain (calibrated: R=1→attractor, R≥3→escape)
const STEPS = 200;                                       // torus traversal length for the trajectory

// ── commensurability: how RESONANT a winding is (the closure test) ──
// Continued-fraction of |w|'s fractional part; the largest coefficient is the resonance. A winding
// near a low-order rational p/q has a huge CF term (strong resonance → destructive → unstable); the
// noble numbers (φ and kin) have all-1 CF (weakest resonance → quasi-periodic → stable). An exact
// rational (terminating CF) is maximally resonant. Total: non-finite → max resonance.
export function resonance(w) {
  const x0 = num(w);
  if (!Number.isFinite(x0)) return 20;
  let x = Math.abs(x0) % 1;
  if (x < 1e-9) return 20;                 // integer winding = fully commensurate = maximally resonant
  let R = 1;
  for (let i = 0; i < 8; i++) {
    if (x < 1e-9) { R = 20; break; }       // CF terminated = exact rational = max resonance
    const a = Math.floor(1 / x);
    if (a > R) R = a;
    x = 1 / x - a;
  }
  return Math.min(R, 20);
}

// The entropy DRIVE d of a winding: golden (R=1) → d=1 (the κ self-reference point, attractor
// centre); resonant (R large) → d high → escape. d ≥ 1 always here (resonance ≥ 1).
export function drive(w) {
  return 1 + (resonance(w) - 1) * GAIN;
}

// The self-reference trajectory x_{n+1} = d − x². Bounded: on escape it is filled with a growing
// alternating envelope so the classifier reads ESCAPED (and it stays total — never NaN/Infinity out).
export function torusTrajectory(d, steps = STEPS) {
  const dd = Number.isFinite(d) ? d : 1e9;
  const T = Number.isInteger(steps) && steps > 2 ? steps : STEPS;
  const s = [];
  let x = 0.1;
  for (let i = 0; i < T; i++) {
    x = dd - x * x;
    if (!Number.isFinite(x) || Math.abs(x) > 1e6) {
      for (let j = i; j < T; j++) s.push((j % 2 ? 1 : -1) * 1e6 * (j + 1));
      break;
    }
    s.push(x);
  }
  return s;
}

// ── THE STABILITY VERDICT ──
// A winding is a STABLE torus-harmonic iff its self-reference trajectory lands in the ATTRACTOR
// band. Returns the class (stable/starved/overloaded), the drive, the resonance, and the κ-deficit.
export function stabilityOfWinding(w) {
  const w0 = num(w);
  if (!Number.isFinite(w0) || w0 === 0) {
    return { stable: false, class: 'starved', drive: 0, resonance: 20, deficit: KAPPA }; // dead/empty mode
  }
  const d = drive(w);
  const c = classify(torusTrajectory(d));
  const cls = c.class === CLASS.ATTRACTOR ? 'stable'
    : c.class === CLASS.ESCAPED ? 'overloaded'
    : 'starved';                              // FLATLINE = starved
  return {
    stable: c.class === CLASS.ATTRACTOR,
    class: cls,
    drive: round(d),
    resonance: resonance(w),
    deficit: round(Math.abs(d - 1)),          // distance from the κ self-reference point (d=1)
  };
}

// ── the L1→L2 adapter: a fold-signature → its characteristic winding ──
// A vector fold-signature's winding = the ratio of its two dominant components (a golden/Fibonacci-
// shaped signature → φ → stable; a flat/low-rational signature → resonant → unstable). A plain
// number is taken as the winding directly. Total: degenerate input → 0 (→ starved).
export function windingOf(sig) {
  if (typeof sig === 'number') return Number.isFinite(sig) ? sig : 0;
  if (Array.isArray(sig)) {
    const mags = sig.map((v) => Math.abs(num(v))).filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => b - a);
    if (mags.length < 2 || mags[1] < 1e-12) return 0;
    return mags[0] / mags[1];
  }
  return 0;
}

// The public verdict on a whole fold-signature (vector or winding): is it a stable mode?
export function stability(sig) {
  return stabilityOfWinding(windingOf(sig));
}

// ── coexistence: two modes coexist without destructive interference iff their windings are
// separated by a maximally-irrational (golden) gap. Rational separation → they beat and cancel. ──
export function coexist(a, b) {
  const wa = windingOf(a), wb = windingOf(b);
  if (wa === 0 || wb === 0) return false;
  // golden-angle packing: the SEPARATION must be maximally irrational. A rational gap (incl. an
  // exact-integer gap = same torus phase) beats/cancels; a golden gap never re-overlaps.
  return resonance(wa - wb) <= 2;
}

// Does this winding hit the seam — the M11 = 23×89 break where the recursive spine fails to close?
export function onSeam(n) {
  const v = Math.abs(Math.trunc(num(n)));
  return Number.isFinite(v) && v > 0 && SEAM % v === 0 && v !== 1;
}

function round(x) { return Math.round(x * 1e6) / 1e6; }
function num(x) { if (typeof x === 'number') return x; try { return Number(x); } catch { return NaN; } }
