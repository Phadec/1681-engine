import {
  action,
  condition,
  cooldown,
  invert,
  parallel,
  reactiveSelector,
  reactiveSequence,
  repeat,
  retry,
  selector,
  sequence,
  succeed,
  timeout,
  wait,
  type ActionOptions,
  type BtNode,
  type BtStatus,
} from './behaviorTree';

/**
 * A tree written as data (a JSON file a designer edits): composites hold `children`, decorators one `child`, and
 * leaves name an action or a condition the game registered.
 *
 * ```json
 * { "type": "reactiveSelector", "children": [
 *   { "type": "sequence", "children": [{ "type": "condition", "name": "hurt" }, { "type": "action", "name": "flee" }] },
 *   { "type": "cooldown", "ms": 2000, "child": { "type": "action", "name": "bark" } },
 *   { "type": "action", "name": "wander" }
 * ] }
 * ```
 */
export type BtSpec =
  | { type: 'sequence' | 'selector' | 'reactiveSequence' | 'reactiveSelector'; children: BtSpec[] }
  | { type: 'parallel'; succeed?: number; fail?: number; children: BtSpec[] }
  | { type: 'invert' | 'succeed'; child: BtSpec }
  | { type: 'repeat' | 'retry'; times: number; child: BtSpec }
  | { type: 'cooldown' | 'timeout'; ms: number; child: BtSpec }
  | { type: 'wait'; ms: number }
  | { type: 'action' | 'condition'; name: string }
  /** A named subtree of the registry, so a tree is shared by several (a "flee" every monster uses). */
  | { type: 'tree'; name: string };

/** What the leaves of a data tree name. */
export interface BtRegistry<C> {
  actions?: Record<string, ((ctx: C, now: number) => BtStatus) | { run: (ctx: C, now: number) => BtStatus } & ActionOptions<C>>;
  conditions?: Record<string, (ctx: C) => boolean>;
  trees?: Record<string, BtSpec>;
}

/** A tree from its data. Throws, naming the path, on an unknown type, a missing leaf or a subtree that names itself. */
export function buildTree<C>(spec: BtSpec, registry: BtRegistry<C>): BtNode<C> {
  return build(spec, registry, '$', []);
}

function build<C>(spec: BtSpec, reg: BtRegistry<C>, path: string, trees: string[]): BtNode<C> {
  const fail = (why: string): never => {
    throw new Error(`buildTree: ${path}: ${why}`);
  };
  if (!spec || typeof spec !== 'object') return fail('not a node');
  const kids = (list: unknown): BtNode<C>[] => {
    if (!Array.isArray(list) || list.length === 0) return fail('needs children');
    return list.map((c, i) => build(c as BtSpec, reg, `${path}.children[${i}]`, trees));
  };
  const one = (c: unknown) => build(c as BtSpec, reg, `${path}.child`, trees);
  const num = (v: unknown, what: string): number => (typeof v === 'number' && v >= 0 ? v : fail(`${what} must be a number of at least 0`));
  switch (spec.type) {
    case 'sequence':
      return sequence(...kids(spec.children));
    case 'selector':
      return selector(...kids(spec.children));
    case 'reactiveSequence':
      return reactiveSequence(...kids(spec.children));
    case 'reactiveSelector':
      return reactiveSelector(...kids(spec.children));
    case 'parallel':
      return parallel({ succeed: spec.succeed, fail: spec.fail }, ...kids(spec.children));
    case 'invert':
      return invert(one(spec.child));
    case 'succeed':
      return succeed(one(spec.child));
    case 'repeat':
      return repeat(num(spec.times, 'times'), one(spec.child));
    case 'retry':
      return retry(num(spec.times, 'times'), one(spec.child));
    case 'cooldown':
      return cooldown(num(spec.ms, 'ms'), one(spec.child));
    case 'timeout':
      return timeout(num(spec.ms, 'ms'), one(spec.child));
    case 'wait':
      return wait(num(spec.ms, 'ms'));
    case 'condition': {
      const test = reg.conditions?.[spec.name];
      return test ? condition(spec.name, test) : fail(`no condition '${spec.name}'`);
    }
    case 'action': {
      const a = reg.actions?.[spec.name];
      if (!a) return fail(`no action '${spec.name}'`);
      return typeof a === 'function' ? action(spec.name, a) : action(spec.name, a.run, { onHalt: a.onHalt });
    }
    case 'tree': {
      const sub = reg.trees?.[spec.name];
      if (!sub) return fail(`no tree '${spec.name}'`);
      if (trees.includes(spec.name)) return fail(`tree '${spec.name}' contains itself`);
      return build(sub, reg, `${path}<${spec.name}>`, [...trees, spec.name]);
    }
    default:
      return fail(`unknown type '${(spec as { type?: unknown }).type}'`);
  }
}
