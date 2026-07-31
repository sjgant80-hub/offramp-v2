// ════════════════════════════════════════════════════════════════
// fall-remember · a sovereign, fold-native memory organ — si-didy's REMEMBER, built from the solids.
//
// Memory is not a flat vector scan and it is not a rented cloud store. It is a DODECAHEDRON: 12 chambers,
// each bordering exactly 5 (the real face-adjacency graph). A memory routes to ONE chamber; retrieval
// searches only that chamber and its 5 neighbours — memory is LOCAL, you never scan everything.
//
// The honest engineering underneath the geometry (the witness pass on the original spec):
//   · ROUTE  — an LSH partition: a memory routes to the chamber whose axis it is most aligned with, so
//              similar memories land in the same / adjacent chamber. (Raw-hash routing filled chambers
//              unevenly AND destroyed locality — this is the §6 fix, done as locality-sensitive hashing.)
//   · CUBE   — a query returns a cube: 1 focal + 8 context. The 8 are the nearest by COSINE within the
//              local region, not by insertion order — so the corners are genuinely related, not "added at
//              the same time". Exact cosine over ~6/12 chambers is fast and correct at si-didy scale
//              (thousands–low-millions); HNSW only earns its place at billion-scale, which this is not.
//   · VERIFY — an octahedron κ-gate at read: a degenerate or (with a validator) drifted/runaway signature
//              is rejected, so a corrupted memory is never handed back.
//   · PLACE  — golden-angle (Vogel) layout within a chamber, ranked by content — the index/visualisation.
//   · ADDRESS— content-addressed (128-bit): the same memory has the same name in every session.
//
// Sovereign: single object, JSON-serialisable to one file (SQLite/IndexedDB is just the envelope). Zero
// dependencies. Deterministic. Node and browser. Bring your own embeddings, or use the built-in one.
// ════════════════════════════════════════════════════════════════

export const KAPPA = (Math.sqrt(5) - 1) / 2;            // 1/φ ≈ 0.618 — the estate's stability threshold
export const DIM = 96;                                  // embedding dimension for the built-in embed()

// The dodecahedral face-adjacency graph: each of 12 chambers borders exactly 5.
export const DODECA = [
  [1, 2, 3, 4, 5], [0, 2, 5, 6, 7], [0, 1, 3, 7, 8], [0, 2, 4, 8, 9],
  [0, 3, 5, 9, 10], [0, 1, 4, 6, 10], [1, 5, 7, 10, 11], [1, 2, 6, 8, 11],
  [2, 3, 7, 9, 11], [3, 4, 8, 10, 11], [4, 5, 6, 9, 11], [6, 7, 8, 9, 10],
];

// ── vector math (vectors are kept L2-normalised, so cosine == dot) ──
function normalize(v) { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return v.map((x) => x / s); }
function dot(a, b) { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; }
export function cosine(a, b) { return dot(a, b); }

// ── deterministic PRNG (mulberry32) — for reproducible, sovereign chamber axes ──
function rng(seed) {
  return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// 12 fixed, well-spread chamber axes (seeded Gaussian unit vectors → near-uniform on the DIM-sphere).
// A memory's chamber is the axis it aligns with most — locality-sensitive by construction.
export const AXES = (() => {
  const r = rng(0x5EED12);
  const axes = [];
  for (let c = 0; c < 12; c++) {
    const v = new Array(DIM);
    for (let i = 0; i < DIM; i++) {
      const u1 = Math.max(r(), 1e-12), u2 = r();
      v[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);  // Box–Muller
    }
    axes.push(normalize(v));
  }
  return axes;
})();

// ── built-in embedding — char n-gram hashing → normalised DIM vector (zero-dep, deterministic). Bring
// your own real embeddings for production; this is enough to route and to prove relevance. ──
export function embed(text, dim = DIM) {
  const v = new Array(dim).fill(0);
  const s = ' ' + String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  for (let n = 3; n <= 4; n++) for (let i = 0; i + n <= s.length; i++) {
    const g = s.slice(i, i + n);
    let h = 2166136261; for (let j = 0; j < g.length; j++) { h ^= g.charCodeAt(j); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % dim] += ((h >>> 7) & 1) ? 1 : -1;
  }
  return normalize(v);
}

// route a vector to its chamber = the most-aligned axis (the LSH partition — locality-preserving)
export function chamber(vec) {
  let best = 0, bd = -Infinity;
  for (let c = 0; c < 12; c++) { const d = dot(vec, AXES[c]); if (d > bd) { bd = d; best = c; } }
  return best;
}

// content address — 128-bit, deterministic (FNV-1a × 4 + fmix), no crypto needed
export function address(s) {
  s = String(s); let out = '';
  for (const seed of [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]) {
    let h = seed;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

// golden-angle layout position of the i-th memory in a chamber (the index/visualisation, content-ranked)
export function goldenPos(i) { const th = i * 2.399963229728653; const r = Math.sqrt(i + 1); return [r * Math.cos(th), r * Math.sin(th)]; }

export class FallRemember {
  constructor() { this.chambers = Array.from({ length: 12 }, () => []); this.size = 0; }

  // store a memory: { id?, text?, vector?, sig?, meta? }. Returns the stored record, or null if degenerate.
  store(mem) {
    const vector = mem && mem.vector ? normalize(mem.vector.slice()) : embed(mem && mem.text || '');
    if (!vector.some((x) => x !== 0) || vector.some((x) => !Number.isFinite(x))) return null; // κ-gate at write
    const c = chamber(vector);
    const name = (mem && mem.id) || address((mem && mem.text || '') + '|' + JSON.stringify(mem && mem.vector || null));
    const rec = { name, text: mem && mem.text, vector, sig: mem && mem.sig, meta: (mem && mem.meta) || {}, chamber: c };
    this.chambers[c].push(rec);
    this.size++;
    return rec;
  }

  // κ-gate at read: reject a degenerate vector; if the memory carries a fold-signature and a validator is
  // supplied, reject a signature that does not verify (drifted / runaway). This is the octahedron.
  _verify(rec, validate) {
    if (!rec || !rec.vector || rec.vector.some((x) => !Number.isFinite(x))) return false;
    if (rec.sig && validate) { try { const r = validate(rec.sig); return !!r && r.valid === true; } catch { return false; } }
    return true;
  }

  // retrieve a CUBE — 1 focal + up to k context — by EXACT cosine.
  //   default (exact:true)  — scan every chamber: recall == flat cosine. At si-didy scale a full scan is
  //                           milliseconds, so recall is never traded away; the geometry gives the cube its
  //                           STRUCTURE (focal + context) and the chambers give traversal + layout.
  //   local pruning         — pass { exact:false, probes } to search only the regions of the query's top-
  //                           `probes` chambers (+ their 5 neighbours each). Fewer chambers touched, some
  //                           recall given up — the scale knob, honestly measured (see relevance.mjs).
  retrieve(query, { k = 8, validate = null, exact = true, probes = 1 } = {}) {
    const qv = Array.isArray(query) ? normalize(query.slice()) : embed(query);
    let region;
    if (exact) region = Array.from({ length: 12 }, (_, i) => i);
    else {
      const top = AXES.map((ax, c) => [c, dot(qv, ax)]).sort((a, b) => b[1] - a[1]).slice(0, Math.max(1, probes)).map((x) => x[0]);
      const set = new Set();
      for (const c of top) { set.add(c); for (const nb of DODECA[c]) set.add(nb); }
      region = [...set];
    }
    const cand = [];
    for (const c of region) for (const rec of this.chambers[c]) if (this._verify(rec, validate)) cand.push(rec);
    cand.sort((a, b) => dot(qv, b.vector) - dot(qv, a.vector));
    if (!cand.length) return { center: null, corners: [], chambersSearched: region.length };
    return { center: cand[0], corners: cand.slice(1, 1 + k), chambersSearched: region.length, score: dot(qv, cand[0].vector) };
  }

  // walk the dodecahedron edge-graph from a chamber (retrieve-by-lineage, N hops of 5 neighbours)
  traverse(start, hops = 1) {
    let frontier = new Set([start]); const seen = new Set([start]);
    for (let h = 0; h < hops; h++) { const next = new Set(); for (const c of frontier) for (const nb of DODECA[c]) if (!seen.has(nb)) { seen.add(nb); next.add(nb); } frontier = next; }
    return [...seen];
  }

  distribution() { return this.chambers.map((c) => c.length); }              // fill per chamber (balance check)
  toJSON() { return { v: 1, size: this.size, chambers: this.chambers }; }    // single-file persistence
  static fromJSON(o) { const s = new FallRemember(); if (o && Array.isArray(o.chambers)) { s.chambers = o.chambers; s.size = o.size ?? o.chambers.flat().length; } return s; }
}

export default FallRemember;
