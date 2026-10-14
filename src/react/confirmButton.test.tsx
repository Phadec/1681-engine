/** @jsxRuntime automatic */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToString } from 'react-dom/server';
import { createStore } from '../ui/dom/createStore';
import { ConfirmButton } from './ConfirmButton';
import { UiProvider } from './UiProvider';
import { useJsonSelector, useStoreJson } from './useJsonSelector';
import { useStore } from './useStore';

test('a confirm button is quiet until armed, then says what the second click does', () => {
  const idle = renderToString(<ConfirmButton armKey="a" armed={null} setArmed={() => {}} onConfirm={() => {}} label="Remove" armedLabel="Really remove" />);
  assert.match(idle, /class="e1681-button small ghost"/);
  assert.match(idle, />Remove</);
  const armed = renderToString(
    <UiProvider classNames={{ button: 'btn' }} labels={{ confirmAgain: 'Sûr ?' }}>
      <ConfirmButton armKey="a" armed="a" setArmed={() => {}} onConfirm={() => {}} label="Remove" />
    </UiProvider>,
  );
  assert.match(armed, /class="e1681-button btn small e1681-armed primary"/);
  assert.match(armed, /Sûr \?/);
  // another button of the group armed: this one stays quiet
  assert.match(renderToString(<ConfirmButton armKey="b" armed="a" setArmed={() => {}} onConfirm={() => {}} label="Disband" />), /ghost/);
  // uncontrolled, it starts quiet
  assert.match(renderToString(<ConfirmButton onConfirm={() => {}} label="Go" />), />Go</);
});

test('a JSON selector reads a plain copy of the selected content', () => {
  const store = createStore({ buffs: [{ id: 'haste', n: 2 }], other: 1 });
  let seen: unknown;
  function Reader() {
    seen = useStoreJson(store, (s) => s.buffs.map((b) => b.id));
    return null;
  }
  renderToString(<Reader />);
  assert.deepEqual(seen, ['haste']);
  function HookReader() {
    seen = useJsonSelector<{ buffs: { id: string }[]; other: number }, number | undefined>((sel) => useStore(store, sel), () => undefined);
    return null;
  }
  renderToString(<HookReader />);
  assert.equal(seen, null);
});
