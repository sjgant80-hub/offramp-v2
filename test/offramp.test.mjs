import { test } from 'node:test';
import assert from 'node:assert/strict';
import classify, { CLASS } from '../kernel/attractor.mjs';
import {
  normalize, canonMessages, address, chunkEnvelope, makeArchive, ingest, archiveAll,
  extractV1, extractV2, durable, goldenPlace, query, lineage, mirror,
  goldenOrder, wispWalk, joinStack, signatureWinding, placeInMemory, recall, memoryRecords, KAPPA,
} from '../kernel/offramp.mjs';

// SAME conversation, two vendor shapes — the fixtures that make the "proven" claims testable.
const GPT = { title: 'Building the toll', mapping: {
  root: { id: 'root', parent: null, children: ['a'], message: null },
  a: { id: 'a', parent: 'root', children: ['b'], message: { author: { role: 'user' }, content: { parts: ['what if we make scraping cost compute? idea: a proof-of-work toll'] }, create_time: 1700000000 } },
  b: { id: 'b', parent: 'a', children: ['c'], message: { author: { role: 'assistant' }, content: { parts: ["let's do it. content unlocks only after a hash puzzle. call it the toll."] }, create_time: 1700000060 } },
  c: { id: 'c', parent: 'b', children: [], message: { author: { role: 'user' }, content: { parts: ['going with that. ship it.'] }, create_time: 1700000120 } },
} };
const CLAUDE = { name: 'Building the toll', chat_messages: [
  { sender: 'human', text: 'what if we make scraping cost compute? idea: a proof-of-work toll', created_at: '2023-11-14T22:13:20Z' },
  { sender: 'assistant', text: "let's do it. content unlocks only after a hash puzzle. call it the toll.", created_at: '2023-11-14T22:14:20Z' },
  { sender: 'human', text: 'going with that. ship it.', created_at: '2023-11-14T22:15:20Z' },
] };
const OTHER = { name: 'Redress engine', chat_messages: [
  { sender: 'human', text: 'what about a legal-process navigator? the interface is the product.', created_at: '2023-12-01T10:00:00Z' },
  { sender: 'assistant', text: "let's build the accuracy gate first. schema for verified statutes.", created_at: '2023-12-01T10:01:00Z' },
] };

// ── L0 · normalize + cross-vendor identity (the load-bearing property) ──
test('both vendor shapes normalize to identical message CONTENT (vendor/ts stripped)', () => {
  const eg = normalize('chatgpt', GPT)[0], ec = normalize('claude', CLAUDE)[0];
  assert.equal(eg.source, 'chatgpt'); assert.equal(ec.source, 'claude');
  assert.equal(eg.messages.length, 3);
  assert.equal(canonMessages(eg.messages), canonMessages(ec.messages)); // content identical
  assert.deepEqual(eg.messages.map((m) => m.role), ['user', 'assistant', 'user']);
});

test('content-addressing: the same conversation from two vendors → the SAME address', () => {
  const eg = normalize('chatgpt', GPT)[0], ec = normalize('claude', CLAUDE)[0];
  assert.equal(address(eg), address(ec));                 // cross-vendor dedupe for free
  assert.notEqual(address(eg), address(normalize('claude', OTHER)[0]));
  assert.equal(typeof address(eg), 'string');
  assert.equal(normalize('unknown-vendor', GPT).length, 0); // total on unknown vendor
});

// ── L0 · archive dedupe ──
test('ingest is content-addressed and DEDUPED (same content lands once)', () => {
  const eg = normalize('chatgpt', GPT)[0], ec = normalize('claude', CLAUDE)[0];
  const r = ingest(makeArchive(), [eg, ec]);              // same conversation, two vendors
  assert.equal(r.added, 1);
  assert.equal(r.deduped, 1);
  assert.equal(r.size, 1);
  const r2 = ingest(r.archive, [normalize('claude', OTHER)[0]]);  // a genuinely different one
  assert.equal(r2.added, 1);
  assert.equal(r2.size, 2);
  assert.equal(ingest(makeArchive(), [{ messages: [] }]).added, 0); // empty skipped, total
});

test('chunking is conversation-aware (never splits mid-message)', () => {
  const env = normalize('claude', CLAUDE)[0];
  const chunks = chunkEnvelope(env, 60);
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.every((c) => /^(user|assistant): /m.test(c)));  // each line is a whole message
  assert.equal(chunkEnvelope(null).length, 0);            // total
});

// ── L1 · versioned extraction (L1 = f(L0)) ──
test('extract v1 and v2 are different valid indexes over the SAME L0; v2 is deterministic', () => {
  const arch = ingest(makeArchive(), [normalize('claude', CLAUDE)[0], normalize('claude', OTHER)[0]]).archive;
  const v1 = extractV1(arch), v2 = extractV2(arch);
  assert.equal(v1.version, 1); assert.equal(v2.version, 2);
  assert.notEqual(v1.items.length, v2.items.length);      // different indexes
  assert.ok(v2.items.length > 0);
  assert.equal(JSON.stringify(extractV2(arch)), JSON.stringify(extractV2(arch))); // re-run identical
  // κ-gate: only durable signal placed; a durable decision beats a one-off hypothesis
  assert.equal(durable({ type: 'decision' }), true);
  assert.equal(durable({ type: 'hypothesis', recur: 1 }), false);  // one-off hypothesis below κ
  assert.equal(durable({ type: 'hypothesis', recur: 3 }), true);   // recurring hypothesis is durable
});

test('extract v2 finds the decision, and abandoned = one-off hypotheses (miss-signature)', () => {
  const arch = ingest(makeArchive(), [normalize('claude', CLAUDE)[0]]).archive;
  const v2 = extractV2(arch);
  assert.ok(v2.items.some((it) => it.type === 'decision'));
  assert.ok(Array.isArray(v2.abandoned));
});

// ── L1 · golden placement + L2 retrieval/mirror ──
test('goldenPlace assigns Vogel coordinates; query + lineage read the index', () => {
  const arch = ingest(makeArchive(), [normalize('claude', CLAUDE)[0]]).archive;
  const v2 = extractV2(arch);
  const placed = goldenPlace(v2.items);
  assert.ok(placed.every((p) => Array.isArray(p.pos) && p.pos.length === 2));
  assert.equal(goldenPlace('nope').length, 0);            // total
  assert.ok(query(v2, 'toll').length >= 1);               // retrieval hits
  assert.equal(query(v2, '').length, 0);
  assert.ok(Array.isArray(lineage(v2, 'toll')));
  const m = mirror(v2);
  assert.ok(m.decisions >= 1 && Number.isFinite(m.placed));
});

// ── L3 · the wisp (spiral = alive, orbit = dead) ──
test('goldenOrder covers all n; the golden walk is ALIVE, the naive sweep is not', () => {
  const n = 24;
  const g = goldenOrder(n);
  assert.equal(new Set(g).size, n);                       // covers every rig
  assert.equal(classify(g).class, CLASS.ATTRACTOR);       // spiraling → alive
  assert.notEqual(classify([...Array(n).keys()]).class, CLASS.ATTRACTOR); // orbiting sweep → not alive
  assert.equal(goldenOrder(0).length, 0);                 // total
});

test('wispWalk is stored-nowhere (one live edge) and covers the memory', () => {
  const placed = goldenPlace(Array.from({ length: 20 }, (_, i) => ({ i })));
  const w = wispWalk(placed);
  assert.equal(w.maxActive, 1);                           // present at exactly ONE edge
  assert.equal(w.storedNowhere, true);
  assert.equal(w.covered, true);
  assert.equal(w.total, 20);
  assert.equal(w.alive, true);                            // golden succession → alive
  assert.equal(wispWalk('nope').maxActive, 0);            // total
});

// ── hostile / malformed vendor input → safe, specific outputs (kills the guards) ──
test('malformed vendor input produces safe, specific outputs', () => {
  assert.equal(normalize('chatgpt', 'hello').length, 0);          // non-object raw → no convos
  assert.equal(normalize('chatgpt', 5).length, 0);
  assert.equal(normalize('claude', 42).length, 0);
  assert.deepEqual(normalize('chatgpt', { mapping: null })[0].messages, []);   // no mapping → empty
  assert.deepEqual(normalize('chatgpt', { mapping: 'x' })[0].messages, []);
  // ChatGPT: empty-text and non-user/assistant-role messages are both excluded
  const gpt = { mapping: {
    r: { id: 'r', parent: null, children: ['a'], message: null },
    a: { id: 'a', parent: 'r', children: ['b'], message: { author: { role: 'user' }, content: { parts: [''] } } },
    b: { id: 'b', parent: 'a', children: ['c'], message: { author: { role: 'system' }, content: { parts: ['sys'] } } },
    c: { id: 'c', parent: 'b', children: [], message: { author: { role: 'user' }, content: { parts: ['real'] } } },
  } };
  assert.deepEqual(normalize('chatgpt', gpt)[0].messages.map((m) => m.text), ['real']);
  // Claude: bad sender / missing text excluded; missing name → ''
  const cl = normalize('claude', { chat_messages: [
    { sender: 'system', text: 'x' }, { sender: 'human' }, { sender: 'human', text: 'kept' },
  ] })[0];
  assert.deepEqual(cl.messages.map((m) => m.text), ['kept']);
  assert.equal(cl.title, '');
  // ingest guards
  assert.equal(ingest({ byAddr: {} }, [normalize('claude', CLAUDE)[0]]).size, 1); // missing .order → rebuilt
  assert.equal(ingest(makeArchive(), [{ source: 'x' }]).added, 0);                // env without messages → skipped
});

test('helpers coerce hostile values (S, canon, trunc, golden angle)', () => {
  assert.equal(canonMessages([{}]), '[{"role":"","text":""}]');            // undefined role/text → '' (== null)
  assert.ok(canonMessages([{ role: 'a', text: 5 }]).includes('"5"'));       // number text → string "5" (=== string)
  // trunc keeps a 280-char message whole, cuts a 281-char one (> not >=)
  const long = 'x'.repeat(280), longer = 'x'.repeat(281);
  const arch = ingest(makeArchive(), [normalize('claude', { chat_messages: [{ sender: 'human', text: long }, { sender: 'human', text: longer }] })[0]]).archive;
  const texts = extractV1(arch).items.map((it) => it.text);
  assert.ok(texts.some((t) => t.length === 280 && !t.endsWith('…')));       // 280 kept whole
  assert.ok(texts.some((t) => t.endsWith('…')));                            // 281 truncated
  // GOLDEN_ANGLE = 2π(1−1/φ): the i=1 Vogel point sits in the upper half-plane (y>0); the +1 mutant flips it
  assert.ok(goldenPlace([{}, {}])[1].pos[1] > 0);
});

test('extractV1 is USER-only; signatureWinding is type-sensitive', () => {
  const env = normalize('claude', CLAUDE)[0];
  const arch = ingest(makeArchive(), [env]).archive;
  const userCount = env.messages.filter((m) => m.role === 'user').length;
  assert.equal(extractV1(arch).items.length, userCount);                    // user messages only (=== not !==)
  assert.notEqual(signatureWinding({ type: 'decision', recur: 1 }), signatureWinding({ type: 'message', recur: 1 }));
  assert.notEqual(signatureWinding({ type: 'artifact', recur: 1 }), signatureWinding({ type: 'message', recur: 1 }));
  assert.notEqual(signatureWinding({ type: 'theme', count: 4, recur: 4 }), signatureWinding({ type: 'message', recur: 4 }));
});

// ── titles, chunk boundaries, exact signature-windings, root-finder ordering ──
const env2 = normalize('claude', { chat_messages: [
  { sender: 'human', text: 'ab' }, { sender: 'human', text: 'cd' },
] })[0]; // two lines "user: ab"(8) then "user: cd"(8); running len after first = 9

test('titles are read from the conversation, not the object', () => {
  assert.equal(normalize('chatgpt', GPT)[0].title, 'Building the toll');       // c && c.title
  assert.equal(normalize('claude', CLAUDE)[0].title, 'Building the toll');     // c && (c.name || c.title)
  assert.equal(normalize('claude', { conversations: [null] })[0].messages.length, 0); // null convo safe (c && isArray)
});

test('chunk cap boundaries: default fallback, exact edge, the +1 newline accounting', () => {
  assert.equal(chunkEnvelope(env2, 0).length, 1);      // size 0 → default 1000 (> 0 guard)
  assert.equal(chunkEnvelope(env2, 1.5).length, 1);    // non-integer → default 1000 (&& guard)
  assert.equal(chunkEnvelope(env2, 17).length, 1);     // 17 > 17 is false → no split (> not >=)
  assert.equal(chunkEnvelope(env2, 16).length, 2);     // 17 > 16 splits; the +1 newline is what makes it 17 (+1 not -1)
});

test('signatureWinding uses the exact per-type weight and the recurrence', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
  near(signatureWinding({ type: 'decision', recur: 1 }), 7.2 / 5);           // typeW 5 (=== decision)
  near(signatureWinding({ type: 'artifact', recur: 1 }), 7.2 / 3);           // typeW 3 (=== artifact)
  near(signatureWinding({ type: 'theme', count: 10, recur: 10 }), 1.0);      // typeW = count (=== theme)
  near(signatureWinding({ type: 'message', recur: 5 }), 5 / 2.4);            // recurrence is used (&& / ||)
  assert.ok(Number.isFinite(signatureWinding(null)));                        // null item → safe (it && guards)
  assert.ok(Number.isFinite(signatureWinding(undefined)));
});

test('the ChatGPT root-finder walks from the true root regardless of node order', () => {
  // a child appears BEFORE the root in insertion order, and the root carries a message
  const orphanFirst = { mapping: {
    a: { id: 'a', parent: 'root', children: ['b'], message: { author: { role: 'user' }, content: { parts: ['A'] } } },
    root: { id: 'root', parent: null, children: ['a'], message: { author: { role: 'user' }, content: { parts: ['ROOT'] } } },
    b: { id: 'b', parent: 'a', children: [], message: { author: { role: 'assistant' }, content: { parts: ['B'] } } },
  } };
  assert.deepEqual(normalize('chatgpt', orphanFirst)[0].messages.map((m) => m.text), ['ROOT', 'A', 'B']);
  // an orphan whose parent is missing from the mapping is still a valid start (parent==null OR !mapping[parent])
  const ghostParent = { mapping: {
    a: { id: 'a', parent: 'ghost', children: ['b'], message: { author: { role: 'user' }, content: { parts: ['A'] } } },
    b: { id: 'b', parent: 'a', children: [], message: { author: { role: 'assistant' }, content: { parts: ['B'] } } },
  } };
  assert.deepEqual(normalize('chatgpt', ghostParent)[0].messages.map((m) => m.text), ['A', 'B']);
});

// ── THE JOIN · L1 ⇄ L2 ⇄ L3 in one flow ──
const THIRD = { name: 'Sovereign browser', chat_messages: [
  { sender: 'human', text: 'idea: a sovereign browser — one owned AI operates every site' },
  { sender: 'assistant', text: "let's build the governor kernel first. decided: going with sovereign." },
  { sender: 'human', text: 'the toll idea applies to the edge too. ship it.' },
] };
test('placeInMemory stores into REAL fall-remember chambers; recall returns the cosine CUBE', () => {
  const arch = ingest(makeArchive(), [normalize('claude', CLAUDE)[0], normalize('claude', OTHER)[0], normalize('claude', THIRD)[0]]).archive;
  const items = extractV2(arch).items;
  const fr = placeInMemory(items);
  assert.ok(fr.size >= 3);
  assert.equal(typeof fr.retrieve, 'function');                       // a genuine FallRemember instance
  assert.equal(memoryRecords(fr).length, fr.size);                   // every stored record enumerable
  assert.equal(fr.distribution().reduce((a, b) => a + b, 0), fr.size); // routed across the 12 dodeca chambers
  const cube = recall(fr, 'toll', 4);
  assert.ok(cube.center && typeof cube.center.text === 'string');    // a focal record
  assert.ok(Array.isArray(cube.corners));                            // cosine-nearest context (the CUBE)
  assert.ok(cube.chambersSearched >= 1);
  // recall's k guard: non-positive / non-integer k falls back to the default (6), not passed through
  const def = recall(fr, 'toll').corners.length;
  assert.ok(def >= 2);
  assert.equal(recall(fr, 'toll', 0).corners.length, def);          // k=0 → default (k > 0 guard)
  assert.equal(recall(fr, 'toll', 1.5).corners.length, def);        // non-integer k → default (&& guard)
  // placeInMemory only stores items whose text is a real STRING (a non-string is rejected by the
  // guard, not coerced by store) — this is what distinguishes the && guards from ||
  assert.equal(placeInMemory([{ type: 'decision', text: 123 }]).size, 0);
  assert.equal(placeInMemory('nope').size, 0);                       // total
  assert.equal(memoryRecords(null).length, 0);
  assert.deepEqual(recall(null, 'x').corners, []);
});

test('joinStack threads the archive through fall-remember (L1) · ETH (L2) · wisp (L3)', () => {
  const arch = ingest(makeArchive(), [normalize('claude', CLAUDE)[0], normalize('claude', OTHER)[0]]).archive;
  const j = joinStack(arch);
  assert.ok(j.l0 >= 2);
  assert.ok(j.l1.count >= 1);
  assert.equal(typeof j.l1.memory.retrieve, 'function');             // L1 is a REAL fall-remember store
  assert.equal(j.l1.distribution.reduce((a, b) => a + b, 0), j.l1.count); // records live in the chambers
  assert.ok('mode' in j.encoded[0]);                                 // ETH stability mode attached (L2)
  assert.ok(Number.isFinite(j.l2.stable));
  assert.equal(j.l3.storedNowhere, true);                            // the wisp over the stored records (L3)
  assert.equal(j.l3.covered, true);
  assert.equal(joinStack(null).l0, 0);                               // total
});
