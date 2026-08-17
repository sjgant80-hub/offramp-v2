#!/usr/bin/env node
// claude-code.test.mjs — the adapter for the format the work actually happens in.
//
// ⚑ The off-ramp could read ChatGPT exports and Claude WEB exports, and neither is what Claude Code
// writes. So two days of building reached no memory at all — not a forgotten step, a missing organ.
// An off-ramp that cannot ingest the place you do your thinking is an off-ramp for somebody else's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, makeArchive, ingest, extractV2, address } from '../kernel/offramp.mjs';

const line = (o) => JSON.stringify(o);
const TRANSCRIPT = [
  line({ type: 'custom-title', customTitle: 'a session' }),
  line({ type: 'mode', mode: 'default' }),
  line({ type: 'user', timestamp: '2026-08-17T09:00:00Z', message: { role: 'user', content: 'decided: ship it behind the gate' } }),
  line({ type: 'assistant', timestamp: '2026-08-17T09:00:05Z', message: { role: 'assistant', content: [
    { type: 'text', text: 'Done — the gate is clean.' },
    { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
  ] } }),
  line({ type: 'assistant', timestamp: '2026-08-17T09:00:09Z', message: { role: 'assistant', content: [
    { type: 'tool_use', name: 'Bash', input: {} },
  ] } }),
  'not json at all',
  line({ type: 'queue-operation', op: 'x' }),
].join('\n');

test('a Claude Code transcript is read at all', () => {
  const [conv] = normalize('claude-code', TRANSCRIPT);
  assert.equal(conv.source, 'claude-code');
  assert.equal(conv.title, 'a session');
  assert.equal(conv.messages.length, 2, 'the two messages carrying text, and nothing else');
  assert.deepEqual(conv.messages.map(m => m.role), ['user', 'assistant']);
});

test('text is lifted out of typed content blocks', () => {
  const [conv] = normalize('claude-code', TRANSCRIPT);
  assert.match(conv.messages[1].text, /the gate is clean/);
});

test('⚑ tool traffic is dropped — it is already in git, and it would drown the signal', () => {
  const [conv] = normalize('claude-code', TRANSCRIPT);
  const all = conv.messages.map(m => m.text).join(' ');
  assert.doesNotMatch(all, /npm test/, 'a tool invocation reached the archive');
  assert.equal(conv.messages.some(m => !m.text.trim()), false, 'a message with no text was kept');
});

test('bookkeeping lines and unparseable lines are skipped, not fatal', () => {
  assert.doesNotThrow(() => normalize('claude-code', TRANSCRIPT));
  assert.equal(normalize('claude-code', '')[0].messages.length, 0);
  assert.equal(normalize('claude-code', 'garbage\nmore garbage')[0].messages.length, 0);
});

test('it reaches L1 — the whole point is that a session becomes durable signal', () => {
  const a = makeArchive();
  ingest(a, normalize('claude-code', TRANSCRIPT));
  const ex = extractV2(a);
  assert.ok(ex.items.length > 0, 'a session produced no signatures at all');
  assert.ok(ex.items.some(i => i.type === 'decision'), 'the decision was not classified');
});

test('the address ignores the vendor, so the same conversation dedupes across sources', () => {
  const [cc] = normalize('claude-code', TRANSCRIPT);
  const asWeb = { chat_messages: cc.messages.map(m => ({ sender: m.role === 'user' ? 'human' : 'assistant', text: m.text, created_at: m.ts })) };
  const [web] = normalize('claude', [asWeb]);
  assert.equal(address(cc), address(web), 'the same conversation from two clients produced two addresses');
});
