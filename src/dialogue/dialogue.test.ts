import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DialogueRunner } from './DialogueRunner.ts';
import { compileExpr, type ExprScope } from './expr.ts';
import type { DialogueScript, DialogueStep, ShownLine } from './script.ts';
import { validateDialogue } from './validateDialogue.ts';

const scope = (vars: Record<string, unknown>, fns: Record<string, (...a: unknown[]) => unknown> = {}): ExprScope => ({
  get: (n) => n.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], vars),
  call: (n, a) => fns[n]!(...a) as never,
});
const ev = (src: string, vars: Record<string, unknown> = {}, fns = {}) => compileExpr(src)(scope(vars, fns));

test('expressions: arithmetic with precedence, comparison, logic, text and calls', () => {
  assert.equal(ev('1 + 2 * 3'), 7);
  assert.equal(ev('(1 + 2) * 3'), 9);
  assert.equal(ev('10 % 4 - -2'), 4);
  assert.equal(ev('gold >= 10 && !banned', { gold: 12, banned: false }), true);
  assert.equal(ev('gold >= 10 && !banned', { gold: 12, banned: true }), false);
  assert.equal(ev('a || b && c', { a: false, b: true, c: false }), false);
  assert.equal(ev('name == "Ash"', { name: 'Ash' }), true);
  assert.equal(ev("'You have ' + gold + ' gold'", { gold: 3 }), 'You have 3 gold');
  assert.equal(ev('quest == null', {}), true, 'an unset variable equals null');
  assert.equal(ev('quest != null', { quest: 0 }), true, 'but 0 is not null');
  assert.equal(ev('missing + 1', {}), 1, 'unset reads as 0 in arithmetic');
  assert.equal(ev('hero.level > 2', { hero: { level: 3 } }), true);
  assert.equal(ev('max(a, 2, 5)', { a: 9 }, { max: (...x: number[]) => Math.max(...x) }), 9);
  assert.equal(ev('now()', {}, { now: () => 42 }), 42);
  assert.equal(ev('true && 1.5 < .75 * 3'), true);
  assert.equal(ev('"say \\"hi\\""'), 'say "hi"');
});

test('expressions refuse what is not in the language, saying where', () => {
  for (const bad of ['', '1 +', 'a b', '(1', 'x = 2', '"open', 'a.b.', '1 ? 2 : 3', 'f(1,', 'window["x"]']) {
    assert.throws(() => compileExpr(bad), /expression/, bad);
  }
});

const gate: DialogueScript = {
  start: 'gate',
  nodes: {
    gate: {
      lines: [{ speaker: 'guard', text: 'Halt. The toll is {toll} gold.', tags: ['stern'] }, { text: 'He eyes your purse.', if: 'gold > 0' }],
      choices: [
        { text: 'Pay {toll}.', if: 'gold >= toll', set: { gold: 'gold - toll' }, goto: 'through' },
        { text: "I am the king's messenger.", if: 'has_seal', showLocked: true, once: true, goto: 'through' },
        { text: 'Leave.' },
      ],
    },
    through: { lines: ['The gate creaks open.'], do: ['open_gate', { name: 'sound', args: ['creak', 0.5] }] },
  },
};

function lines(steps: DialogueStep[]): string[] {
  return steps.map((s) => (s.type === 'line' ? `${s.speaker ?? '-'}: ${s.text}` : s.type === 'choices' ? s.choices.map((c) => `${c.enabled ? '' : '(x)'}${c.text}`).join(' | ') : 'END'));
}

test('a dialogue shows its lines, fills in values, offers what may be picked, and runs what a choice does', () => {
  const vars = { gold: 12, toll: 5, has_seal: false };
  const commands: string[] = [];
  const talk = new DialogueRunner(gate, { vars, onCommand: (name, args) => commands.push(`${name}(${args.join(',')})`) });
  const seen = [talk.start(), talk.next(), talk.next()];
  assert.deepEqual(lines(seen), ['guard: Halt. The toll is 5 gold.', '-: He eyes your purse.', "Pay 5. | (x)I am the king's messenger. | Leave."]);
  assert.deepEqual((seen[0] as ShownLine).tags, ['stern']);
  // a locked choice cannot be picked
  assert.equal(talk.choose(1), talk.current);
  assert.equal(talk.current.type, 'choices');
  const after = talk.choose(0);
  assert.deepEqual(lines([after]), ['-: The gate creaks open.']);
  assert.equal(vars.gold, 7);
  assert.deepEqual(commands, ['open_gate()', 'sound(creak,0.5)']);
  assert.equal(talk.next().type, 'end');
  assert.equal(talk.at, null);
});

test('a line whose condition fails is skipped; a choice picked once is gone next time', () => {
  const vars = { gold: 0, toll: 5, has_seal: true };
  const talk = new DialogueRunner(gate, { vars });
  talk.start();
  const choices = talk.next();
  assert.deepEqual(lines([choices]), ["I am the king's messenger. | Leave."]);
  talk.choose(1);
  talk.next();
  assert.equal(talk.visited('through'), 1);
  talk.start();
  assert.deepEqual(lines([talk.next()]), ['Leave.']);
  assert.equal(talk.evaluate('chose("gate", 1)'), true);
  assert.equal(talk.evaluate('visited("gate")'), 2);
  assert.equal(talk.choose(2).type, 'end', 'a choice that leads nowhere ends it');
});

test('a node with no choices goes on by its next, branching on the first condition that holds', () => {
  const script: DialogueScript = {
    nodes: {
      a: { lines: ['A'], set: { n: 'n + 1' }, next: [{ if: 'n > 2', goto: 'done' }, { goto: 'b' }] },
      b: { next: 'a' },
      done: { lines: ['n is {n}'] },
    },
  };
  const talk = new DialogueRunner(script, { vars: { n: 0 } });
  const said = [talk.start()];
  for (let i = 0; i < 3; i++) said.push(talk.next());
  assert.deepEqual(lines(said), ['-: A', '-: A', '-: A', '-: n is 3']);
});

test('only locked choices left go on by next; with no next the dialogue ends', () => {
  const script: DialogueScript = {
    nodes: {
      ask: { lines: ['?'], choices: [{ text: 'Secret', if: 'knows', showLocked: true, goto: 'ask' }], next: 'fallback' },
      fallback: { lines: ['You know nothing.'] },
    },
  };
  const talk = new DialogueRunner(script, { vars: { knows: false } });
  talk.start();
  assert.deepEqual(lines([talk.next()]), ['-: You know nothing.']);
});

test('assignments read every right side first, and write into dotted names', () => {
  const vars: Record<string, unknown> = { a: 1, b: 2 };
  const talk = new DialogueRunner({ nodes: { x: { set: { a: 'b', b: 'a', 'hero.mood': '"glad"' }, lines: ['{a}{b} {hero.mood}'] } } }, { vars });
  assert.deepEqual(lines([talk.start()]), ['-: 21 glad']);
  assert.deepEqual(vars, { a: 2, b: 1, hero: { mood: 'glad' } });
  assert.throws(() => new DialogueRunner({ nodes: { x: { set: { '__proto__.polluted': '1' } } } }).start(), /cannot set/);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('braces are written doubled; translation comes before values are filled in', () => {
  const talk = new DialogueRunner(
    { nodes: { x: { lines: [{ text: 'Hello {name} {{not}}', key: 'hi' }], choices: [{ text: 'Bye', key: 'bye' }] } } },
    { vars: { name: 'Ash' }, translate: (text, key) => (key === 'hi' ? 'Bonjour {name} {{pas}}' : key === 'bye' ? 'Au revoir' : text) },
  );
  assert.deepEqual(lines([talk.start(), talk.next()]), ['-: Bonjour Ash {pas}', 'Au revoir']);
});

test('a command may jump or stop the dialogue', () => {
  const script: DialogueScript = {
    nodes: {
      a: { do: ['away'], lines: ['never said'] },
      b: { lines: ['B'] },
      c: { do: ['quit'], lines: ['never said either'] },
    },
  };
  const talk = new DialogueRunner(script, { onCommand: (name, _args, r) => (name === 'away' ? r.jump('b') : r.stop()) });
  assert.deepEqual(lines([talk.start()]), ['-: B']);
  assert.equal(talk.jump('c').type, 'end');
});

test('a loop that never shows anything is caught; an unknown node or function is named', () => {
  const loop = new DialogueRunner({ nodes: { a: { next: 'b' }, b: { next: 'a' } } });
  assert.throws(() => loop.start(), /loops without showing anything/);
  assert.throws(() => new DialogueRunner({ nodes: { a: { next: 'zz' } } }).start(), /no node 'zz'/);
  assert.throws(() => new DialogueRunner({ nodes: { a: { lines: [{ text: 'x', if: 'nope()' }] } } }).start(), /no function 'nope'/);
  assert.equal(new DialogueRunner({ nodes: {} }).start().type, 'end');
});

test('a saved dialogue is restored where it was, without running the node again', () => {
  let opened = 0;
  const vars = { gold: 12, toll: 5, has_seal: true };
  const talk = new DialogueRunner(gate, { vars, onCommand: () => opened++ });
  talk.start();
  talk.next();
  talk.next();
  talk.choose(1);
  const save = talk.save();
  assert.equal(opened, 2);
  const later = new DialogueRunner(gate, { vars: {}, onCommand: () => opened++ });
  const back = later.restore(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(lines([back]), ['-: The gate creaks open.']);
  assert.equal(opened, 2);
  assert.equal(later.vars.gold, 12);
  later.start();
  later.next();
  assert.deepEqual(lines([later.next()]), ['Pay 5. | Leave.'], 'the choice picked once stays picked');
  assert.equal(later.restore({ ...save, node: null }).type, 'end');
});

test('next and choose do nothing at the wrong moment', () => {
  const talk = new DialogueRunner(gate, { vars: { gold: 9, toll: 5 } });
  const first = talk.start();
  assert.equal(talk.choose(0), first);
  talk.next();
  const choices = talk.next();
  assert.equal(talk.next(), choices);
  assert.equal(talk.choose(99), choices);
});

test('validation finds missing nodes, bad expressions, unknown commands and functions, and nodes nothing reaches', () => {
  const script: DialogueScript = {
    start: 'a',
    nodes: {
      a: {
        lines: ['Hi {name', { text: 'x', if: 'gold >' }, 'ok {{fine}}'],
        choices: [{ text: 'go', goto: 'nowhere', do: ['dance'] }, { text: 'f', if: 'lucky()' }],
        next: [{ if: 'a b', goto: 'b' }],
      },
      b: { set: { gold: 'gold +' } },
      orphan: { lines: ['lonely'] },
    },
  };
  const issues = validateDialogue(script, { commands: ['sing'], functions: [] });
  const got = issues.map((i) => `${i.level} ${i.path}: ${i.message.replace(/expression '.*': /, '')}`);
  assert.deepEqual(got.sort(), [
    "error nodes.a.choices[0].do[0]: no command 'dance'",
    "error nodes.a.choices[0].goto: no node 'nowhere'",
    "error nodes.a.choices[1].if: no function 'lucky'",
    'error nodes.a.lines[1].if: ended early',
    "error nodes.a.next[0].if: unexpected 'b'",
    'error nodes.b.set.gold: ended early',
    'warning nodes.orphan: nothing leads here from the start',
  ].sort());
  // "Hi {name" has no closing brace: it is plain text, not an expression
  assert.deepEqual(validateDialogue(gate), []);
  assert.deepEqual(validateDialogue({ nodes: {} }).map((i) => i.message), ['the script has no nodes']);
  assert.deepEqual(validateDialogue({ start: 'x', nodes: { a: {} } }).map((i) => i.path), ['start', 'nodes.a']);
});
