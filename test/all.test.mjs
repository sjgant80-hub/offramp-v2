// test/all.test.mjs — the one door the gate walks through: importing a node:test file registers
// its tests, so this single entry runs every suite on every platform (v0.6 takes one test file,
// and 'node --test <dir>' does not resolve on Windows — both traps land here).
import './offramp.test.mjs';
import './claude-code.test.mjs';
import './gate-hardening.test.mjs';
