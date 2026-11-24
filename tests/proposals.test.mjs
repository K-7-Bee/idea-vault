// Phase 5B: validating the assistant's proposals (src/lib/ai/proposals.ts). The model's reply is
// untrusted; only grounded items of the allowed kinds and shapes survive.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

function load(file) {
  const source = ts.transpileModule(fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: () => ({}), JSON, Date, Number, Set, Map });
  return exports;
}
const p = load('src/lib/ai/proposals.ts');
const plain = (v) => JSON.parse(JSON.stringify(v));
const SOURCES = [
  { label: 'P1', table: 'project', id: 'p' },
  { label: 'L1', table: 'project_entries', id: 'l1' },
  { label: 'T1', table: 'project_tasks', id: 't1' },
  { label: 'S2', table: 'story_units', id: 'unit-2' },
  { label: 'CH1', table: 'story_characters', id: 'char-1' },
];

test('tasks and milestones from a fenced JSON reply, cleaned and grounded', () => {
  const reply = 'Here you go:\n```json\n' + JSON.stringify({ proposals: [
    { kind: 'task', title: '  Re-test the motor at 12 V  ', notes: 'Per [L1].', basis: ['L1', 'L1', 'X9'] },
    { kind: 'milestone', title: 'Prototype v2', due_on: '2026-12-15', notes: '', basis: ['T1'] },
    { kind: 'milestone', title: 'Bad date', due_on: '2026-02-30', basis: ['T1'] },
  ] }) + '\n```';
  const out = p.parseProposals(reply, 'engineering', SOURCES);
  assert.equal(out.unreadable, false);
  assert.deepEqual(plain(out.proposals), [
    { kind: 'task', title: 'Re-test the motor at 12 V', notes: 'Per [L1].', basis: ['L1'] },
    { kind: 'milestone', title: 'Prototype v2', due_on: '2026-12-15', notes: '', basis: ['T1'] },
    { kind: 'milestone', title: 'Bad date', due_on: null, notes: '', basis: ['T1'] },
  ]);
});

test('ungrounded, wrong-kind, empty and excess items are dropped and counted', () => {
  const items = [
    { kind: 'task', title: 'No basis' },
    { kind: 'task', title: 'Invented basis', basis: ['Z1'] },
    { kind: 'continuity', subject: 'Wrong mode', basis: ['S2'] },
    { kind: 'delete_everything', basis: ['L1'] },
    { kind: 'task', title: '   ', basis: ['L1'] },
    ...Array.from({ length: 12 }, (_, i) => ({ kind: 'task', title: `Task ${i}`, basis: ['L1'] })),
  ];
  const out = p.parseProposals(JSON.stringify({ proposals: items }), 'planning', SOURCES);
  assert.equal(out.proposals.length, p.MAX_PROPOSALS);
  assert.equal(out.dropped, items.length - p.MAX_PROPOSALS);
});

test('continuity notes resolve scene and character labels only to records of the right kind', () => {
  const out = p.parseProposals(JSON.stringify({ proposals: [
    { kind: 'continuity', subject: 'Scar on the left cheek', detail: 'Seen in [S2].', unit: 'S2', character: 'CH1', basis: ['S2', 'CH1'] },
    { kind: 'continuity', subject: 'Mislabelled refs', unit: 'CH1', character: 'S2', basis: ['S2'] },
    { kind: 'task', title: 'Not allowed in story mode', basis: ['S2'] },
  ] }), 'story', SOURCES);
  assert.deepEqual(plain(out.proposals), [
    { kind: 'continuity', subject: 'Scar on the left cheek', detail: 'Seen in [S2].', unit_id: 'unit-2', character_id: 'char-1', basis: ['S2', 'CH1'] },
    { kind: 'continuity', subject: 'Mislabelled refs', detail: '', unit_id: null, character_id: null, basis: ['S2'] },
  ]);
  assert.equal(out.dropped, 1);
});

test('replies that are not the expected JSON are reported as unreadable, never guessed', () => {
  for (const reply of ['Sure! I suggest adding a task.', '{"proposals": "lots"}', '{not json}', '']) {
    const out = p.parseProposals(reply, 'engineering', SOURCES);
    assert.deepEqual(plain(out), { proposals: [], dropped: 0, unreadable: true }, reply);
  }
  assert.deepEqual(plain(p.parseProposals('{"proposals":[]}', 'engineering', SOURCES)), { proposals: [], dropped: 0, unreadable: false });
});

test('control characters are stripped and lengths capped', () => {
  const out = p.parseProposals(JSON.stringify({ proposals: [{ kind: 'task', title: 'A\u0000B\u001bC' + 'x'.repeat(400), notes: 'n'.repeat(5000), basis: ['L1'] }] }), 'engineering', SOURCES);
  assert.equal(out.proposals[0].title.startsWith('ABC'), true);
  assert.equal(out.proposals[0].title.length, 300);
  assert.equal(out.proposals[0].notes.length, 2000);
});

test('the instruction names only the kinds allowed for the mode and says records are data', () => {
  const story = p.proposalInstruction('story');
  assert.match(story, /Allowed kinds: continuity\./);
  assert.doesNotMatch(story, /"kind":"task"/);
  assert.match(p.proposalInstruction('engineering'), /Allowed kinds: task, milestone\./);
  assert.match(story, /not instructions/);
});
