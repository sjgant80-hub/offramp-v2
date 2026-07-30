// ════════════════════════════════════════════════════════════════
// attractor · a trajectory liveness classifier
//
// Feed it a numeric trajectory — a metric over time, an agent's score across runs, a repo's
// commit cadence, a biomarker series — and it tells you which of three dynamical regimes the system
// is in:
//
//   • FLATLINE — the trajectory has settled to a fixed point; it no longer moves. A dead / converged
//     / stuck system. (Not always bad: a controller that reached its setpoint is "flatline".)
//   • ATTRACTOR — bounded but never settling: it keeps varying within a range without converging or
//     diverging. The signature of a live, self-sustaining system.
//   • ESCAPED — the magnitude is running away without bound. A diverging / runaway system.
//
// This is a heuristic classifier over a finite sample, not a formal Lyapunov analysis — it reports
// the evidence (bounds, recent variance, growth) alongside the label so you can judge. Zero
// dependencies, pure and deterministic: the same series always yields the same verdict.
// ════════════════════════════════════════════════════════════════

export const CLASS = { FLATLINE: 'flatline', ATTRACTOR: 'attractor', ESCAPED: 'escaped', UNKNOWN: 'unknown' };

const DEFAULTS = {
  minPoints: 8,      // below this there isn't enough trajectory to judge
  flatEps: 0.02,     // recent std-dev below this fraction of the trajectory's scale ⇒ settled
  escapeGrowth: 3,   // last-quarter magnitude this many× the first-quarter's ⇒ candidate runaway
};

export function classify(series, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  // Keep only genuine numeric data. Number(null)/Number('')/Number(false)/Number([]) all coerce to 0
  // and would sneak past a bare Number.isFinite filter as fabricated zeroes, so junk gets excluded here
  // rather than misread as a flatline at 0.
  const xs = (Array.isArray(series) ? series : [])
    .filter(v => typeof v === 'number' ? Number.isFinite(v) : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))))
    .map(Number);
  if (xs.length < o.minPoints) return { class: CLASS.UNKNOWN, alive: false, reason: `need at least ${o.minPoints} finite points, got ${xs.length}` };

  const n = xs.length;
  const half = Math.floor(n / 2);
  const q = Math.max(2, Math.floor(n / 4));
  const second = xs.slice(half);
  const firstQ = xs.slice(0, q);
  const lastQ = xs.slice(n - q);

  // loop, not Math.min(...xs) — spreading a large array (~130k+) overflows the call stack.
  let min = xs[0], max = xs[0];
  for (let i = 1; i < n; i++) { if (xs[i] < min) min = xs[i]; if (xs[i] > max) max = xs[i]; }
  const range = max - min;
  // "Settled" is judged against the trajectory's SPREAD (range), not its absolute level. Folding the
  // mean into the scale made the test translation-variant — a live oscillation riding on a DC offset
  // (e.g. 1000 + sin) looked settled purely because of the baseline. Range carries the spread and is
  // invariant to a constant shift, which is the physically meaningful thing here.
  const spread = Math.max(range, 1e-9);

  const varSecond = variance(second);
  const stdSecond = Math.sqrt(varSecond);

  // Settled: the recent portion barely moves relative to the trajectory's spread.
  const settled = stdSecond < o.flatEps * spread;
  // Divergence is judged by the ENVELOPE (peak |x| per window), not a mean-magnitude ratio. A
  // magnitude ratio off a near-zero start (a delayed onset or amplitude ramp-up) explodes even though
  // the trajectory is strictly bounded, so it can't tell a booting oscillator from a runaway. An
  // escaped trajectory instead has an envelope that keeps EXPANDING to the end: each window's peak
  // clearly exceeds the previous and the last is the global peak. A bounded oscillation plateaus.
  const windowPeaks = chunkMaxAbs(xs, 4);
  const growth = windowPeaks[windowPeaks.length - 1] / Math.max(windowPeaks[0], 1e-9);
  const diverging = isEnvelopeExpanding(windowPeaks, o.escapeGrowth) && !settled;

  let cls;
  if (diverging) cls = CLASS.ESCAPED;
  else if (settled) cls = CLASS.FLATLINE;
  else cls = CLASS.ATTRACTOR;

  return {
    class: cls,
    alive: cls === CLASS.ATTRACTOR,
    metrics: {
      n, min: r4(min), max: r4(max), range: r4(range),
      recentStd: r4(stdSecond), spread: r4(spread),
      growth: r4(growth), settled, diverging,
    },
    explain: EXPLAIN[cls],
  };
}

const EXPLAIN = {
  [CLASS.FLATLINE]: 'Settled to a fixed point — recent variation is negligible. Converged or stuck.',
  [CLASS.ATTRACTOR]: 'Bounded but never settling — keeps moving within a range. A live, self-sustaining regime.',
  [CLASS.ESCAPED]: 'Magnitude is running away without bound. Diverging / runaway.',
  [CLASS.UNKNOWN]: 'Not enough trajectory to classify.',
};

// Convenience: is the system alive (a bounded, non-trivial attractor)?
export function isAlive(series, opts) { return classify(series, opts).alive; }

// ── stats helpers (pure) ─────────────────────────────────────────────────────
function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function meanAbs(a) { return a.reduce((s, x) => s + Math.abs(x), 0) / a.length; }
function variance(a) { if (a.length < 2) return 0; const m = mean(a); return a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length; }
// Peak |x| per window — the trajectory's ENVELOPE, sampled in EXACTLY k evenly-divided windows (a
// floor(len/k) step left a ragged extra window for odd lengths, which broke the monotonic-envelope
// test for e.g. a linear runaway at n=9/11/13). Loop-based max, no array spread (stack-safe on big N).
function chunkMaxAbs(a, k) {
  const out = [];
  for (let w = 0; w < k; w++) {
    const lo = Math.floor(w * a.length / k), hi = Math.floor((w + 1) * a.length / k);
    let m = 0;
    for (let i = lo; i < hi; i++) { const abs = Math.abs(a[i]); if (abs > m) m = abs; }
    out.push(m);
  }
  return out;
}
// The envelope is EXPANDING (a runaway) iff every window's peak clearly exceeds the previous, the
// last window holds the global peak, and the net growth crosses the escape factor. A bounded
// oscillation — even one with a quiet start — plateaus, so an intermediate window fails the growth step.
function isEnvelopeExpanding(peaks, escapeGrowth) {
  if (peaks.length < 2) return false;
  for (let i = 1; i < peaks.length; i++) if (peaks[i] < peaks[i - 1] * 1.15) return false;
  const last = peaks[peaks.length - 1];
  return last === Math.max(...peaks) && last > peaks[0] * Math.max(2, escapeGrowth);
}
function r4(x) { return Math.round(x * 10000) / 10000; }

export default classify;
