/*
 * A dialogue as data: a JSON file a writer edits, or an object in code. Nodes hold lines said in order, then either
 * choices for the player or a `next` that goes on by itself. Conditions (`if`) and assignments (`set`) are written in
 * the expression language of `expr.ts`; `{…}` inside a text is an expression whose value is put in its place.
 *
 * ```json
 * { "start": "gate", "nodes": {
 *   "gate": {
 *     "lines": [{ "speaker": "guard", "text": "Halt. The toll is {toll} gold." }],
 *     "choices": [
 *       { "text": "Pay.", "if": "gold >= toll", "set": { "gold": "gold - toll" }, "goto": "through" },
 *       { "text": "I am the king's messenger.", "if": "has_seal", "once": true, "goto": "through" },
 *       { "text": "Leave." }
 *     ] },
 *   "through": { "lines": ["The gate creaks open."], "do": ["open_gate"] }
 * } }
 * ```
 */

/** One line said: by `speaker` (absent: narration). A bare string is a line of narration. */
export interface DialogueLine {
  text: string;
  speaker?: string;
  /** Said only when this holds. */
  if?: string;
  /** The game's own marks (a portrait's mood, a sound): handed back with the line. */
  tags?: string[];
  /** A translation key, handed to `translate` with the text. */
  key?: string;
}

/** Something the game does, by name: `"open_gate"`, or `{ "name": "give", "args": ["key", 1] }`. */
export type DialogueCommand = string | { name: string; args?: unknown[] };

/** One answer the player may pick. */
export interface DialogueChoice {
  text: string;
  /** Where it leads (absent: the dialogue ends). */
  goto?: string;
  /** Offered only when this holds. */
  if?: string;
  /** When `if` fails, show it greyed out instead of leaving it out (the player sees what they lack). */
  showLocked?: boolean;
  /** Offered only until picked once. */
  once?: boolean;
  /** Assignments run when it is picked: name → expression. */
  set?: Record<string, string>;
  do?: DialogueCommand[];
  key?: string;
}

/** A way on from a node with no choices: the first branch whose `if` holds (or that has none) is taken. */
export interface DialogueBranch {
  if?: string;
  goto: string;
}

export interface DialogueNode {
  lines?: (string | DialogueLine)[];
  choices?: DialogueChoice[];
  /** Where to go after the lines when there are no choices: a node, or branches. Absent: the dialogue ends. */
  next?: string | DialogueBranch[];
  /** Assignments run on entering the node, before its lines. */
  set?: Record<string, string>;
  /** Commands run on entering the node, after `set`. */
  do?: DialogueCommand[];
}

export interface DialogueScript {
  /** Where `start()` begins (default the first node). */
  start?: string;
  nodes: Record<string, DialogueNode>;
}

/** A line as the runner hands it on: with its `{…}` filled in and translated. */
export interface ShownLine {
  type: 'line';
  node: string;
  speaker: string | undefined;
  text: string;
  tags: readonly string[];
}

export interface ShownChoice {
  /** What to pass to `choose`. */
  index: number;
  text: string;
  /** False for a `showLocked` choice whose condition fails: drawn, but not pickable. */
  enabled: boolean;
}

export interface ShownChoices {
  type: 'choices';
  node: string;
  choices: ShownChoice[];
}

export interface DialogueEnd {
  type: 'end';
}

/** Where a dialogue stands: a line to show, choices to offer, or the end. */
export type DialogueStep = ShownLine | ShownChoices | DialogueEnd;
