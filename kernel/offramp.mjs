// offramp.mjs — the sovereign chat-history off-ramp. A dead vendor JSON export → live memory.
//   L0 ARCHIVE   immutable · normalized · content-addressed · NEVER curated
//   L1 EXTRACT   L1 = f(L0) · pure · deterministic · VERSIONED → fold-signatures, κ-gated, golden-placed
//   L2 RETRIEVAL si-didy reads L1, falls back to L0 verbatim · + the mirror
//   L3 WISP      the moving fold-frontier over the placed memory (one live edge, stored-nowhere)
//
// The one rule: source is immutable, extraction is derived and re-runnable. Keep L0 intact and
// every future extractor is free (re-run extract-v2 over the same archive, lose nothing).
//
// sha256 (vendored, vector-verified) and the gated `attractor` organ are imported, not reinvented.
import { sha256 } from './sha256.mjs';
import classify, { CLASS } from './attractor.mjs';
import { foldSubset } from './fold.mjs';                      // L1 codec — a signature ⇄ a bloom coordinate
import { stabilityOfWinding, windingOf } from './eth.mjs';    // L2 dynamics — is a signature a stable mode?
import FallRemember from './fall-remember.mjs';               // L1 store — the real dodeca memory organ

export const KAPPA = 0.618;                         // the durability gate — only stable signal is placed
const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = 2 * Math.PI * (1 - 1 / PHI);   // 137.5° Vogel placement

// ══ L0 · adapters: any vendor export → one normalized envelope ══
export const ADAPTERS = { chatgpt: normalizeChatGPT, claude: normalizeClaude };
export function normalize(source, raw) {
  const fn = ADAPTERS[S(source)];
  return typeof fn === 'function' ? fn(raw) : [];
}
function convosOf(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.conversations)) return raw.conversations;
  if (raw && typeof raw === 'object') return [raw];
  return [];
}
// ChatGPT: messages nested in a `mapping` graph — walk root→children, take user/assistant text.
function normalizeChatGPT(raw) {
  return convosOf(raw).map((c) => {
    const mapping = c && c.mapping && typeof c.mapping === 'object' ? c.mapping : {};
    const nodes = Object.values(mapping);
    const messages = []; const seen = new Set();
    let cur = nodes.find((n) => n && (n.parent == null || !mapping[n.parent]));
    while (cur && cur.id != null && !seen.has(cur.id)) {
      seen.add(cur.id);
      const m = cur.message;
      if (m && m.author && m.content) {
        const role = m.author.role;
        const parts = Array.isArray(m.content.parts) ? m.content.parts : [];
        const text = parts.filter((p) => typeof p === 'string').join('\n').trim();
        if ((role === 'user' || role === 'assistant') && text) messages.push({ role, text, ts: normTs(m.create_time) });
      }
      const kids = Array.isArray(cur.children) ? cur.children : [];
      cur = kids.length ? mapping[kids[0]] : null;
    }
    return { source: 'chatgpt', title: S(c && c.title), messages };
  });
}
// Claude: a flat `chat_messages` array with sender/text.
function normalizeClaude(raw) {
  return convosOf(raw).map((c) => {
    const arr = c && Array.isArray(c.chat_messages) ? c.chat_messages : [];
    const messages = arr.map((m) => {
      const role = m && m.sender === 'human' ? 'user' : (m && m.sender === 'assistant' ? 'assistant' : null);
      const text = m && typeof m.text === 'string' ? m.text.trim() : '';
      return role && text ? { role, text, ts: normTs(m.created_at) } : null;
    }).filter(Boolean);
    return { source: 'claude', title: S(c && (c.name || c.title)), messages };
  });
}

// ══ L0 · content-addressing: identity by CONTENT (vendor + timestamps STRIPPED) ══
// This is the property that turns "my chat importer" into "the off-ramp anyone can point at any
// vendor": the same conversation from ChatGPT and from Claude yields the SAME address → dedupe free.
export function canonMessages(messages) {
  const arr = Array.isArray(messages) ? messages : [];
  return JSON.stringify(arr.map((m) => ({ role: S(m && m.role), text: S(m && m.text) })));
}
export function address(envelope) {
  return sha256(canonMessages(envelope && envelope.messages));
}

// ══ L0 · chunking (conversation-aware — never split mid-message) ══
export function chunkEnvelope(env, size = 1000) {
  const msgs = env && Array.isArray(env.messages) ? env.messages : [];
  const cap = Number.isInteger(size) && size > 0 ? size : 1000;
  const chunks = []; let buf = []; let len = 0;
  for (const m of msgs) {
    const line = `${S(m && m.role)}: ${S(m && m.text)}`;
    if (len + line.length > cap && buf.length) { chunks.push(buf.join('\n')); buf = []; len = 0; }
    buf.push(line); len += line.length + 1;
  }
  if (buf.length) chunks.push(buf.join('\n'));
  return chunks;
}

// ══ L0 · the archive: immutable, append-only, content-addressed, DEDUPED ══
export function makeArchive() { return { byAddr: {}, order: [] }; }
export function ingest(archive, envelopes) {
  const a = archive && archive.byAddr && Array.isArray(archive.order) ? archive : makeArchive();
  const envs = Array.isArray(envelopes) ? envelopes : [envelopes];
  let added = 0, deduped = 0;
  for (const env of envs) {
    if (!env || !Array.isArray(env.messages) || env.messages.length === 0) continue;
    const addr = address(env);
    if (a.byAddr[addr]) { deduped++; continue; }         // same content (any vendor) lands once
    a.byAddr[addr] = { addr, source: env.source, title: env.title, messages: env.messages, chunks: chunkEnvelope(env) };
    a.order.push(addr);
    added++;
  }
  return { archive: a, added, deduped, size: a.order.length };
}
export function archiveAll(archive) {
  const order = archive && Array.isArray(archive.order) ? archive.order : [];
  return order.map((addr) => archive.byAddr[addr]).filter(Boolean);
}

// ══ L1 · the extractor: L1 = f(L0), pure, VERSIONED ══
// v1 — naive: every user message is a signal (a deliberately simple first index).
export function extractV1(archive) {
  const items = [];
  for (const conv of archiveAll(archive))
    for (const m of conv.messages)
      if (m.role === 'user') items.push({ v: 1, type: 'message', text: trunc(m.text), conv: conv.addr, title: conv.title });
  return { version: 1, items };
}
// v2 — the durable signal only, typed and κ-gated.
const RE = {
  decision: /\b(let'?s (?:do|go with|build|use|ship)|going with|we'?ll (?:use|do|build)|decided|i'?ll (?:build|use|do)|ship it)\b/i,
  hypothesis: /\b(what if|maybe we|could we|idea:|what about|i wonder|perhaps we|hypothesis)\b/i,
  artifact: /```|\bcall it\b|\bnamed?\b|\bthe spec\b|\bschema\b/i,
};
function classifyText(text) {
  if (RE.decision.test(text)) return 'decision';
  if (RE.artifact.test(text)) return 'artifact';
  if (RE.hypothesis.test(text)) return 'hypothesis';
  return null;
}
const STOP = new Set('this that with have will your just been they them then than what when about would could should like really thing from into here there does your yours also'.split(' '));
function keywords(text) {
  return S(text).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
}
export function extractV2(archive) {
  const raw = [];
  for (const conv of archiveAll(archive))
    for (const m of conv.messages) {
      const type = classifyText(m.text);
      if (type) raw.push({ v: 2, type, text: trunc(m.text), conv: conv.addr, title: conv.title, role: m.role });
    }
  const kwCount = {};
  for (const it of raw) for (const k of new Set(keywords(it.text))) kwCount[k] = (kwCount[k] || 0) + 1;
  for (const it of raw) { const ks = keywords(it.text); it.recur = ks.length ? Math.max(...ks.map((k) => kwCount[k] || 1)) : 1; }
  const themes = Object.entries(kwCount).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])
    .slice(0, 12).map(([k, c]) => ({ v: 2, type: 'theme', text: k, count: c, recur: c }));
  // κ-GATE: only durable signal is PLACED into L1; noise stays in L0 and never pollutes the index.
  const items = raw.concat(themes).filter(durable);
  const abandoned = raw.filter((it) => it.type === 'hypothesis' && it.recur <= 1); // miss-signature, applied to you
  return { version: 2, items, abandoned, themes };
}
function durability(it) {
  if (!it) return 0;
  if (it.type === 'decision' || it.type === 'artifact') return 0.9;
  if (it.type === 'hypothesis') return it.recur > 1 ? 0.8 : 0.4;
  if (it.type === 'theme') return Math.min(1, 0.5 + 0.1 * ((it.count || 1) - 1));
  return 0.3;
}
export function durable(it) { return durability(it) >= KAPPA; }

// ══ L1 · placement: golden-angle (Vogel) into fall-remember ══
export function goldenPlace(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr.map((it, i) => {
    const th = i * GOLDEN_ANGLE, r = Math.sqrt(i + 1);
    return { ...it, pos: [r * Math.cos(th), r * Math.sin(th)], i };
  });
}

// ══ L2 · retrieval: read L1, fall back to L0 verbatim; + the mirror ══
export function query(index, q) {
  const items = index && Array.isArray(index.items) ? index.items : [];
  const needle = S(q).toLowerCase().trim();
  if (!needle) return [];
  return items.filter((it) => S(it.text).toLowerCase().includes(needle))
    .sort((a, b) => (b.recur || 1) - (a.recur || 1));
}
export function lineage(index, term) {
  const items = index && Array.isArray(index.items) ? index.items : [];
  const t = S(term).toLowerCase();
  return items.filter((it) => S(it.text).toLowerCase().includes(t))
    .map((it) => ({ text: it.text, conv: it.conv, title: it.title, type: it.type }));
}
export function mirror(index) {
  const items = index && Array.isArray(index.items) ? index.items : [];
  const themes = (index && Array.isArray(index.themes) ? index.themes : []);
  return {
    recurrences: themes.slice(0, 8).map((t) => ({ theme: t.text, count: t.count })),
    abandonedCount: (index && Array.isArray(index.abandoned) ? index.abandoned.length : 0),
    decisions: items.filter((it) => it.type === 'decision').length,
    placed: items.length,
  };
}

// ══ L3 · THE WISP: the moving fold-frontier over the placed memory ══
// Golden-succession walk — present at exactly ONE edge (stored-nowhere), covering all N by maximal
// spread. Its visit-order is attractor-classified: a golden walk is bounded-non-settling (ALIVE);
// a naive 0..N-1 sweep escapes (its envelope expands) — the liveness the wisp organ proves.
export function goldenOrder(n) {
  if (!Number.isInteger(n) || n <= 0) return [];
  const step = Math.max(1, Math.round(n / PHI));      // golden low-discrepancy stride
  const order = []; const seen = new Set(); let idx = 0;
  for (let k = 0; k < n; k++) {
    let guard = 0;
    while (seen.has(idx) && guard < n) { idx = (idx + 1) % n; guard++; }
    seen.add(idx); order.push(idx);
    idx = (idx + step) % n;
  }
  return order;
}
export function wispWalk(placed) {
  const arr = Array.isArray(placed) ? placed : [];
  const n = arr.length;
  const order = goldenOrder(n);
  const trail = []; let maxActive = 0; const lit = new Set();
  for (const i of order) {
    lit.clear(); lit.add(i);                            // present at ONE edge — it LEAVES the previous
    if (lit.size > maxActive) maxActive = lit.size;
    trail.push(arr[i]);
  }
  const alive = n === 0 ? false : (n < 8 ? true : classify(order).class === CLASS.ATTRACTOR);
  return {
    order, trail,
    coverage: trail.length, total: n, covered: n > 0 && trail.length === n,
    maxActive,                                          // stored-nowhere invariant: must be 1
    storedNowhere: maxActive <= 1,
    alive,
  };
}

// ══ THE JOIN · L1 ⇄ L2 ⇄ L3 wired into one flow over your archive ══
// extract (κ-gated) → fold-encode each signature into its primorial-lattice coordinate (L1 codec) →
// give it an ETH stability mode (L2 dynamics) → golden-place into fall-remember (L1 store) → the
// wisp walks the placed memory (L3 substrate). One pipeline; the same gated kernels, not copies.
export const RINGS7 = [2, 3, 5, 7, 11, 13, 17];
// a signature's winding for ETH: the dominant-component ratio of its shape-vector (recurrence,
// durability, type-weight). Durable/recurring signatures shape toward the golden band; one-offs stay flat.
export function signatureWinding(it) {
  const typeW = it && it.type === 'decision' ? 5 : it && it.type === 'artifact' ? 3 : it && it.type === 'theme' ? (it.count || 2) : 2;
  return windingOf([ (it && it.recur) || 1, durability(it) * 8, typeW ]);
}
// L1 STORE (for real): place each durable signature into a real fall-remember dodeca store.
// Each signature routes (LSH) to one of 12 chambers; retrieval is fall-remember's cosine CUBE.
export function placeInMemory(items) {
  const fr = new FallRemember();
  for (const it of (Array.isArray(items) ? items : [])) {
    if (it && typeof it.text === 'string' && it.text) {
      fr.store({ text: it.text, sig: S(it.conv), meta: { type: it.type, conv: it.conv, title: it.title, recur: it.recur, mode: it.mode, stable: it.stable, bloom: it.bloom } });
    }
  }
  return fr;
}
// Every stored record across the 12 chambers (for the wisp to walk).
export function memoryRecords(fr) {
  const ch = fr && Array.isArray(fr.chambers) ? fr.chambers : [];
  const out = [];
  for (const c of ch) if (Array.isArray(c)) for (const r of c) out.push(r);
  return out;
}
// L2 RECALL (for real): fall-remember's cosine CUBE — focal + nearest-by-meaning context.
export function recall(fr, q, k = 6) {
  if (!fr || typeof fr.retrieve !== 'function') return { center: null, corners: [], chambersSearched: 0 };
  try { return fr.retrieve(S(q), { k: Number.isInteger(k) && k > 0 ? k : 6 }); }
  catch { return { center: null, corners: [], chambersSearched: 0 }; }
}

export function joinStack(archive) {
  const idx = extractV2(archive);                              // L1 · extract, κ-gated to durable signal
  const themeRing = {};                                        // top ≤7 themes ↦ the 7 prime rings
  idx.themes.slice(0, 7).forEach((t, i) => { themeRing[t.text] = RINGS7[i]; });
  const encoded = idx.items.map((it) => {
    const lit = [...new Set(keywords(it.text).map((k) => themeRing[k]).filter(Boolean))];
    const mode = stabilityOfWinding(signatureWinding(it));     // L2 · ETH geometric mode
    return { ...it, bloom: foldSubset(lit), rings: lit, mode: mode.class, stable: mode.stable };
  });
  const memory = placeInMemory(encoded);                       // L1 · REAL fall-remember store (dodeca chambers)
  const records = memoryRecords(memory);
  const wisp = wispWalk(goldenPlace(records));                 // L3 · the moving frontier over the stored records
  const lineages = idx.themes.map((t) => {                     // L2 applied to lineages (living vs transient)
    const s = stabilityOfWinding(windingOf([t.count, KAPPA * 10, 2]));
    return { theme: t.text, count: t.count, mode: s.class };
  });
  return {
    l0: archive && Array.isArray(archive.order) ? archive.order.length : 0,
    l1: { memory, count: memory.size, distribution: memory.distribution() },   // the real store
    l2: { mirror: mirror(idx), lineages, stable: encoded.filter((e) => e.stable).length },
    l3: wisp,
    encoded, abandoned: idx.abandoned,
  };
}

// ── helpers (total) ──
function S(x) { try { return typeof x === 'string' ? x : (x == null ? '' : String(x)); } catch { return ''; } }
function normTs(t) { const n = Number(t); return Number.isFinite(n) ? n : 0; }
function trunc(t) { const s = S(t); return s.length > 280 ? s.slice(0, 277) + '…' : s; }
