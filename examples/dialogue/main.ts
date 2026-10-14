// A playground for dialogue scripts: edit the JSON on the left, see what validateDialogue finds at once, and play it
// through on the right with its variables in view and editable. Nothing is drawn with Pixi: a writer's tool, not a
// game screen. The script is kept in this browser between visits.
import { DialogueRunner, validateDialogue, type DialogueScript, type DialogueStep } from '../../src';

const SAMPLE: DialogueScript = {
  start: 'gate',
  nodes: {
    gate: {
      lines: [
        { speaker: 'guard', text: 'Halt. The toll is {toll} gold.', tags: ['stern'] },
        { text: 'He eyes your purse.', if: 'gold > 0' },
      ],
      choices: [
        { text: 'Pay {toll}.', if: 'gold >= toll', set: { gold: 'gold - toll' }, goto: 'through' },
        { text: "I am the king's messenger.", if: 'has_seal', showLocked: true, once: true, goto: 'through' },
        { text: 'Haggle.', if: '!visited("haggle")', goto: 'haggle' },
        { text: 'Leave.' },
      ],
    },
    haggle: {
      // `set` runs before the lines, so the line already reads the lowered toll
      lines: [{ speaker: 'guard', text: 'Fine. {toll}, and not a coin less.' }],
      set: { toll: 'toll - 2' },
      next: 'gate',
    },
    through: { lines: ['The gate creaks open.'], do: ['open_gate'] },
  },
};
const START_VARS = { gold: 4, toll: 5, has_seal: false };
const STORE = 'dialogue-playground';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const source = $<HTMLTextAreaElement>('source');
const issuesEl = $('issues');
const nodesEl = $('nodes');
const playEl = $('play');
const varsEl = $<HTMLTableElement>('vars');
const logEl = $('log');
const status = $('status');

let script: DialogueScript | null = null;
let runner: DialogueRunner | null = null;
let vars: Record<string, unknown> = {};
let transcript: DialogueStep[] = [];

function loadSaved(): string {
  try {
    return localStorage.getItem(STORE) ?? JSON.stringify(SAMPLE, null, 2);
  } catch {
    return JSON.stringify(SAMPLE, null, 2);
  }
}

function save(text: string): void {
  try {
    localStorage.setItem(STORE, text);
  } catch {
    // a private window: the script lasts until the tab closes
  }
}

const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Reads the text box: parse, check, and (when it parses) restart the play. */
function reload(): void {
  const text = source.value;
  save(text);
  issuesEl.replaceChildren();
  try {
    script = JSON.parse(text) as DialogueScript;
  } catch (e) {
    script = null;
    issuesEl.append(el('div', 'error', `JSON: ${(e as Error).message}`));
    status.textContent = '';
    return;
  }
  const issues = validateDialogue(script);
  if (issues.length === 0) issuesEl.append(el('div', 'ok', 'No problems found.'));
  for (const i of issues) issuesEl.append(el('div', i.level, `${i.level === 'error' ? '✗' : '!'} ${i.path}: ${i.message}`));
  status.textContent = `${Object.keys(script.nodes ?? {}).length} nodes, ${issues.filter((i) => i.level === 'error').length} errors`;
  restart();
}

function restart(): void {
  if (!script) return;
  vars = structuredClone(START_VARS);
  logEl.replaceChildren();
  runner = new DialogueRunner(script, {
    vars,
    onCommand: (name, args) => logEl.prepend(el('div', '', `${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`)),
  });
  transcript = [];
  failure = null;
  act(() => runner!.start());
}

/** What the script threw while playing (a missing node, a loop): shown under the transcript, not lost. */
let failure: string | null = null;

function act(next: () => DialogueStep): void {
  try {
    transcript.push(next());
  } catch (e) {
    transcript.push({ type: 'end' });
    failure = (e as Error).message;
  }
  draw();
}

function draw(): void {
  drawPlay();
  drawVars();
  drawNodes();
}

function drawPlay(): void {
  playEl.replaceChildren();
  transcript.forEach((step, k) => {
    const last = k === transcript.length - 1;
    if (step.type === 'line') {
      const say = el('div', 'say');
      if (step.speaker) say.append(el('b', '', `${step.speaker}: `));
      say.append(document.createTextNode(step.text));
      if (step.tags.length) say.append(el('div', 'tags', step.tags.map((t) => `#${t}`).join(' ')));
      playEl.append(say);
      if (last) {
        const b = el('button', '', 'Next ▸') as HTMLButtonElement;
        b.onclick = () => act(() => runner!.next());
        playEl.append(b);
        b.focus();
      }
    } else if (step.type === 'choices') {
      if (!last) return;
      const box = el('div', 'choices');
      for (const c of step.choices) {
        const b = el('button', '', `${c.index + 1}. ${c.text}`) as HTMLButtonElement;
        b.disabled = !c.enabled;
        b.onclick = () => act(() => runner!.choose(c.index));
        box.append(b);
      }
      playEl.append(box);
    } else playEl.append(el('div', 'end', '— the end —'));
  });
  if (failure) playEl.append(el('div', 'error', `✗ ${failure}`));
}

function drawVars(): void {
  varsEl.replaceChildren();
  for (const [name, value] of Object.entries(vars)) {
    const row = el('tr');
    const input = document.createElement('input');
    input.value = JSON.stringify(value);
    // a variable edited mid-conversation counts from the next condition on, as a game event would
    input.onchange = () => {
      try {
        vars[name] = JSON.parse(input.value);
        input.style.borderColor = '';
      } catch {
        input.style.borderColor = '#ff8a8a';
      }
    };
    const cell = el('td');
    cell.append(input);
    row.append(el('td', '', name), cell);
    varsEl.append(row);
  }
}

function drawNodes(): void {
  nodesEl.replaceChildren();
  if (!script) return;
  const unreached = new Set(validateDialogue(script).filter((i) => i.level === 'warning').map((i) => i.path.replace(/^nodes\./, '')));
  for (const [name, node] of Object.entries(script.nodes ?? {})) {
    const box = el('div', `node${runner?.at === name ? ' here' : ''}${unreached.has(name) ? ' unreached' : ''}`);
    const visits = runner?.visited(name) ?? 0;
    box.append(el('b', '', name), document.createTextNode(` ${node.lines?.length ?? 0} lines, ${node.choices?.length ?? 0} choices${visits ? `, visited ${visits}×` : ''}`));
    const targets = [
      ...(node.choices ?? []).map((c) => c.goto).filter((t): t is string => !!t),
      ...(typeof node.next === 'string' ? [node.next] : (node.next ?? []).map((b) => b.goto)),
    ];
    if (targets.length) {
      const to = el('div', 'to', '→ ');
      [...new Set(targets)].forEach((t, i) => {
        if (i) to.append(document.createTextNode(', '));
        const a = el('a', '', t);
        // jump the play there, to try a node without walking to it
        a.onclick = () => act(() => runner!.jump(t));
        to.append(a);
      });
      box.append(to);
    }
    nodesEl.append(box);
  }
}

let timer = 0;
source.addEventListener('input', () => {
  clearTimeout(timer);
  timer = window.setTimeout(reload, 300);
});
$('restart').onclick = restart;
$('download').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([source.value], { type: 'application/json' }));
  a.download = 'dialogue.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
$<HTMLInputElement>('file').onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  source.value = await f.text();
  reload();
};
// number keys pick a choice, Space or Enter goes on
window.addEventListener('keydown', (e) => {
  if (document.activeElement === source || !runner) return;
  const step = runner.current;
  if (step.type === 'choices' && /^Digit[1-9]$/.test(e.code)) act(() => runner!.choose(Number(e.code.slice(5)) - 1));
});

source.value = loadSaved();
reload();
