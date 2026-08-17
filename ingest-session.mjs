// Run a Claude Code session transcript through the off-ramp into fall-remember.
import { readFileSync } from 'node:fs';
import { normalize, makeArchive, ingest, extractV2, durable, placeInMemory, memoryRecords, recall, mirror } from './kernel/offramp.mjs';

const path = process.argv[2];
const raw = readFileSync(path, 'utf8');
const envs = normalize('claude-code', raw);
const conv = envs[0];
console.log(`L0  · ${conv.messages.length} messages read (title: ${conv.title || 'untitled'})`);

const archive = makeArchive();
ingest(archive, envs);
console.log(`L0  · archived, content-addressed`);

const ex = extractV2(archive);
const keep = ex.items;
console.log(`L1  · ${keep.length} durable signatures placed (κ-gated) · ${ex.abandoned.length} abandoned · ${ex.themes.length} themes`);
for (const k of keep.slice(0, 10)) console.log(`      ${k.type}: ${String(k.text).slice(0, 92)}`);
console.log(`      themes: ${ex.themes.map(t => t.text + '×' + t.count).join(', ').slice(0, 160)}`);

const fr = placeInMemory(keep);
const recs = memoryRecords(fr);
console.log(`L2  · ${recs.length} records placed into fall-remember chambers`);

for (const q of ['the gate was dying not failing', 'what cannot the agent do', 'shipping was blocked', 'shadow surface']) {
  const r = recall(fr, q, 3);
  const c = r && r.center;
  const txt = c && (c.text || (c.item && c.item.text) || (c.record && c.record.text));
  console.log(`      recall "${q}" → ${(txt || 'nothing').toString().slice(0, 84)}  [${r.chambersSearched} chambers, ${(r.corners||[]).length} corners]`);
}
const m = mirror(ex);
console.log(`L3  · mirror: ${JSON.stringify(m).slice(0, 200)}`);
