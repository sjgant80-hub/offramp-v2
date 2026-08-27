// test/gate-hardening.test.mjs — the 2026-08-27 re-gate: the kernel grew after the original 68/68
// (the claude-code adapter, the wisp) and the growth was never mutation-tested. These tests pin the
// exact boundaries a fresh witness run found unpinned. Each block names the mutant class it kills.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, makeArchive, ingest, extractV2, durable, query, lineage, mirror, wispWalk, goldenOrder } from '../kernel/offramp.mjs';

const arch = (texts) => {
  const a = makeArchive();
  ingest(a, normalize('claude', [{ name: 'fixture', chat_messages: texts.map((t) => ({ sender: 'human', text: t })) }]));
  return a;
};

test('THEMES — a keyword seen EXACTLY twice is already a theme (the >=2 floor is inclusive)', () => {
  const v2 = extractV2(arch(['decided: the quasar holds', 'what if quasar drifts wider']));
  const th = v2.themes.find((t) => t.text === 'quasar');
  assert.ok(th, 'two sightings make a theme');
  assert.equal(th.count, 2);
});

test('DURABILITY — theme count 2 (0.6) stays below κ and OUT of items; count 3 (0.7) is placed', () => {
  const two = extractV2(arch(['decided: the quasar holds', 'what if quasar drifts wider']));
  assert.ok(!two.items.some((i) => i.type === 'theme' && i.text === 'quasar'), '0.6 < κ — noise stays in L0');
  const three = extractV2(arch(['decided: sovereign edge holds', 'what if sovereign drifts', 'maybe we fold sovereign further']));
  assert.ok(three.items.some((i) => i.type === 'theme' && i.text === 'sovereign'), '0.7 ≥ κ — placed');
  assert.ok(!durable({ type: 'theme', text: 'x', count: 2 }), 'count 2 → 0.6, not durable');
  assert.ok(durable({ type: 'theme', text: 'x', count: 3 }), 'count 3 → 0.7, durable');
});

test('ABANDONED — a hypothesis at recur EXACTLY 1 is the miss-signature; only hypotheses qualify', () => {
  const v2 = extractV2(arch(['decided: the quasar holds', 'what if quibblezork wobbles sideways']));
  assert.equal(v2.abandoned.length, 1, 'the unique-keyword hypothesis is abandoned');
  assert.equal(v2.abandoned[0].type, 'hypothesis', 'a decision at recur 1 is NOT abandoned');
  const recurring = extractV2(arch(['what if sovereign drifts', 'maybe we let sovereign sing', 'idea: sovereign mesh']));
  assert.equal(recurring.abandoned.length, 0, 'a recurring hypothesis is held, not abandoned');
});

test('KEYWORDS — a four-letter STOP word never becomes a theme', () => {
  const v2 = extractV2(arch(['decided: this holds this line', 'what if this wobbles again']));
  assert.ok(!v2.themes.some((t) => t.text === 'this'), '"this" is stopped despite length and recurrence');
});

test('CLAUDE-CODE ADAPTER — junk blocks and junk lines are skipped, never joined or thrown on', () => {
  const lines = [
    null, 'not-an-object', 7,
    { type: 'user', message: null },
    { type: 'user', message: { role: 'user', content: [null, { type: 'text', text: 123 }, { type: 'tool_use' }, { type: 'text', text: 'real words' }] } },
    { type: 'assistant', message: { role: 'assistant', content: '<div>starts with angle but is not a reminder' } },
  ];
  const [env] = normalize('claude-code', lines);
  assert.equal(env.messages.length, 2, 'null line, string line, number line, null message all skipped');
  assert.equal(env.messages[0].text, 'real words', 'non-string text blocks contribute nothing');
  assert.match(env.messages[1].text, /starts with angle/, 'an angle-bracket start without system-reminder is KEPT');
});

test('L2 GUARDS — query/lineage/mirror on a null or shapeless index refuse gracefully, never throw', () => {
  assert.deepEqual(query(null, 'x'), []);
  assert.deepEqual(query({ items: 'not-a-list' }, 'x'), []);
  assert.deepEqual(lineage(null, 'x'), []);
  const m = mirror(null);
  assert.deepEqual(m.recurrences, []);
  assert.equal(m.abandonedCount, 0);
  assert.equal(m.decisions, 0);
});

test('L2 QUERY — results rank by recurrence, an absent recur reads as 1, not NaN', () => {
  const idx = { items: [
    { text: 'sovereign low', type: 'decision' },              // recur absent → 1
    { text: 'sovereign high', type: 'decision', recur: 5 },
  ] };
  assert.deepEqual(query(idx, 'sovereign').map((i) => i.text), ['sovereign high', 'sovereign low']);
});

test('MIRROR — decisions counts ONLY decisions', () => {
  const idx = { items: [{ type: 'decision' }, { type: 'decision' }, { type: 'decision' }, { type: 'theme' }], themes: [], abandoned: [] };
  assert.equal(mirror(idx).decisions, 3, 'counts decisions, not non-decisions — the counts must differ');
});

test('WISP — a fractional n is refused; the collision path advances FORWARD (n=10, stride shares a factor)', () => {
  assert.deepEqual(goldenOrder(3.5), [], 'a fractional count is not a count');
  const w10 = wispWalk(Array.from({ length: 10 }, (_, i) => ({ i })));
  assert.equal(w10.covered, true, 'the golden stride collides at n=10 and the +1 skip must recover coverage');
  assert.ok(w10.order.every((i) => i >= 0 && i < 10), 'no negative index ever enters the order');
  assert.equal(new Set(w10.order).size, 10);
});

test('WISP — the empty walk is honestly uncovered, a real walk is a full permutation at one edge', () => {
  const empty = wispWalk([]);
  assert.equal(empty.covered, false, 'zero of zero is NOT coverage');
  assert.equal(empty.alive, false);
  const w = wispWalk(Array.from({ length: 13 }, (_, i) => ({ i })));
  assert.equal(w.covered, true);
  assert.equal(new Set(w.order).size, 13, 'no index visited twice');
  assert.equal(w.maxActive, 1, 'stored-nowhere: present at exactly one edge');
  assert.equal(w.alive, true);
});
