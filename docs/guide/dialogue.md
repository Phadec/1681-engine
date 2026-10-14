# Dialogue

`DialogueRunner` runs a branching conversation written as data: lines said in order, choices for the player,
conditions on both, variables set along the way and commands the game carries out. It draws nothing: it hands the
game one step at a time (a line, a set of choices, the end) and the game's own box shows it however it likes, a
typewriter, a portrait, a `RichText`.

## A script

```json
{
  "start": "gate",
  "nodes": {
    "gate": {
      "lines": [
        { "speaker": "guard", "text": "Halt. The toll is {toll} gold.", "tags": ["stern"] },
        { "text": "He eyes your purse.", "if": "gold > 0" }
      ],
      "choices": [
        { "text": "Pay {toll}.", "if": "gold >= toll", "set": { "gold": "gold - toll" }, "goto": "through" },
        { "text": "I am the king's messenger.", "if": "has_seal", "showLocked": true, "once": true, "goto": "through" },
        { "text": "Leave." }
      ]
    },
    "through": { "lines": ["The gate creaks open."], "do": ["open_gate", { "name": "sound", "args": ["creak"] }] }
  }
}
```

- A node holds `lines`, then `choices`, or a `next` that goes on by itself: a node name, or branches
  `[{ "if": "…", "goto": "…" }, { "goto": "…" }]`, the first that holds. No choices and no `next`: the dialogue ends.
- A line is a string (narration) or `{ speaker, text, if, tags, key }`. A line whose `if` fails is skipped.
- A choice is `{ text, goto, if, showLocked, once, set, do, key }`. With no `goto` it ends the dialogue. A choice whose
  `if` fails is left out, or shown greyed (`enabled: false`) with `showLocked`. `once` offers it until it is picked.
- `set` assigns variables (name → expression) on entering a node or picking a choice; every right side is read before
  any is written. Dotted names write into objects (`"hero.mood": "\"glad\""`).
- `do` runs the game's commands: `"open_gate"` or `{ "name": "give", "args": ["key", 1] }`.
- `{expression}` inside a text is replaced by its value; `{{` and `}}` are literal braces.

## Running it

```ts
import { DialogueRunner } from '1681-engine';

const talk = new DialogueRunner(script, {
  vars: save.flags, // shared with the game: conditions read it, `set` writes it
  functions: { has: (item) => inventory.has(String(item)) },
  onCommand: (name, args) => commands[name]?.(...args),
  translate: (text, key) => (key ? t(key) : text),
});

let step = talk.start();
function show(): void {
  if (step.type === 'line') box.say(step.speaker, step.text, step.tags);
  else if (step.type === 'choices') box.offer(step.choices); // { index, text, enabled }
  else box.close();
}
// the player read the line / picked a choice
step = step.type === 'line' ? talk.next() : talk.choose(picked.index);
```

`jump(node)` moves the dialogue from outside (the game's own event broke in), `stop()` ends it; a command may call
either on the runner it is handed. `save()` returns plain data (node, line, variables, visits, choices made) and
`restore(save)` puts the dialogue back where it was without running the node's `set` and `do` again.

## Expressions

Conditions and assignments are a small language of their own, compiled once and run without `eval`: numbers,
strings in `"…"` or `'…'`, `true`, `false`, `null`, variables by (dotted) name, `+ - * / %`, `< > <= >= == !=`,
`&& || !`, parentheses, and calls to `visited("node")` (times entered), `chose("node", index)` and the functions the
game registered. An unset variable reads as `null` (so `quest == null` means never set) and as 0 in arithmetic; `+`
joins text when either side is text. A script can read and set only the variables it is given and call only the
functions it is given, so a modder's script cannot reach anything else.

`compileExpr(source)` is exported, for a game that wants the same language elsewhere (quest conditions, shop
unlocks).

## Checking a script

```ts
import { validateDialogue } from '1681-engine';

const issues = validateDialogue(script, { commands: Object.keys(commands), functions: ['has'] });
// [{ level: 'error', path: 'nodes.gate.choices[0].goto', message: "no node 'throgh'" }, …]
```

It finds `goto` and `next` targets that do not exist, expressions that do not parse (in conditions, assignments and
`{…}`), commands and functions the game does not have (when their lists are given), and nodes nothing reaches from
the start (a warning: the game may `jump` there). Run it over every script in a test.

## Pitfalls

- **A loop with nothing to show is an error.** Nodes that only `next` into each other throw after a thousand hops
  instead of hanging.
- **Only locked choices left is no choice.** When every offered choice is locked, the node goes on by `next` (or ends):
  the player is never stuck in front of greyed buttons.
- **`vars` is shared, not copied.** The runner writes into the object you pass; `restore` replaces its contents in
  place.
- **Translation comes first.** `translate` gets the text as written, before `{…}` is filled in, so a translated line
  keeps its own `{gold}` wherever its language puts it.

## API

[`DialogueRunner`](/api/index/classes/DialogueRunner) · [`DialogueScript`](/api/index/interfaces/DialogueScript) ·
[`validateDialogue`](/api/index/functions/validateDialogue) · [`compileExpr`](/api/index/functions/compileExpr)
