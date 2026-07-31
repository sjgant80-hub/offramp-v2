// run-gate.mjs — proof-of-play for the off-ramp. Mutation-gates the L0→L3 logic (offramp.mjs)
// and fuzzes every boundary function — no crafted vendor export may crash the pipeline. The
// vendored kernels (sha256, attractor, fold, eth) are already gated in their own repos and are
// reused here, not re-mutated.
import { runMutations, fuzz } from './witness.mjs';
import * as off from '../kernel/offramp.mjs';

const TEST = ['node', '--test', 'test/offramp.test.mjs'];
let clean = true;

console.log('── mutation gate (kernel/offramp.mjs — L0→L3 logic) ─────');
const r = runMutations('kernel/offramp.mjs', { testCmd: TEST, cap: 120 });
if (r.baselineFailed) { console.log('  BASELINE RED —', r.reason); clean = false; }
else {
  const ig = r.ignored.length ? ` (+${r.ignored.length} baselined)` : '';
  console.log(`  kernel/offramp.mjs: ${r.killed}/${r.total} killed  score=${r.score}${ig}  ${r.clean ? 'CLEAN' : 'THEATRE'}`);
  for (const s of r.survived) console.log(`     SURVIVED L${s.line}  ${s.mutation}  | ${s.snippet}`);
  clean = clean && r.clean;
}

console.log('\n── fuzz gate (no crafted vendor export may crash the pipeline) ──');
const arch = off.ingest(off.makeArchive(), off.normalize('claude', { chat_messages: [{ sender: 'human', text: 'x' }] })).archive;
for (const [name, fn] of Object.entries({
  'normalize':      (x) => off.normalize(x, x),
  'canonMessages':  (x) => off.canonMessages(x),
  'address':        (x) => off.address(x),
  'chunkEnvelope':  (x) => off.chunkEnvelope(x, x),
  'ingest':         (x) => off.ingest(x, x),
  'archiveAll':     (x) => off.archiveAll(x),
  'extractV1':      (x) => off.extractV1(x),
  'extractV2':      (x) => off.extractV2(x),
  'durable':        (x) => off.durable(x),
  'goldenPlace':    (x) => off.goldenPlace(x),
  'query':          (x) => off.query(x, x),
  'lineage':        (x) => off.lineage(x, x),
  'mirror':         (x) => off.mirror(x),
  'goldenOrder':    (x) => off.goldenOrder(x),
  'wispWalk':       (x) => off.wispWalk(x),
  'signatureWinding': (x) => off.signatureWinding(x),
  'joinStack':      (x) => off.joinStack(x),
  'placeInMemory':  (x) => off.placeInMemory(x),
  'memoryRecords':  (x) => off.memoryRecords(x),
  'recall':         (x) => off.recall(x, x),
})) {
  const f = await fuzz(fn);
  console.log(`  ${name}: ${f.neverThrows ? 'never throws — OK' : 'THREW on ' + f.throwsOn.map((t) => t.input).join(', ')}`);
  clean = clean && f.neverThrows;
}

console.log(clean ? '\n=== ALL CLEAN ===' : '\n=== SURVIVORS / THROWS REMAIN ===');
process.exit(clean ? 0 : 1);
