/** @jsxRuntime automatic */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToString } from 'react-dom/server';
import { createStore } from '../ui/dom/createStore';
import { askChoice, cancelChoice } from './choiceStore';
import { ChoiceDialog } from './ChoiceDialog';
import { askQuantity, cancelConfirm } from './confirmStore';
import { ConfirmDialog } from './ConfirmDialog';
import { Glyph } from './Glyph';
import { Panel } from './Panel';
import { PixelImage } from './PixelImage';
import { Select } from './Select';
import { Slider } from './Slider';
import { SplitPane } from './SplitPane';
import { TabStrip } from './TabStrip';
import { Tooltip } from './Tooltip';
import { UiProvider } from './UiProvider';
import { useStore } from './useStore';

test('a desktop panel is a framed window with a scrolling body; on touch it is a sheet', () => {
  const desk = renderToString(
    <Panel title="Bag" onClose={() => {}} width={320}>
      <p>inside</p>
    </Panel>,
  );
  assert.match(desk, /class="e1681-panel e1681-frame"/);
  assert.match(desk, /width:320px/);
  assert.match(desk, /e1681-panel-body e1681-scroll/);
  assert.match(desk, /aria-label="Close Bag"/);
  assert.doesNotMatch(desk, /translate/);
  const touch = renderToString(
    <UiProvider touch sheetScale={0.8}>
      <Panel title="Bag">x</Panel>
    </UiProvider>,
  );
  assert.match(touch, /e1681-sheet/);
  assert.match(touch, /scale\(0.8\)/);
  assert.doesNotMatch(touch, /e1681-close/);
});

test('labels come from the provider', () => {
  const html = renderToString(
    <UiProvider labels={{ close: 'Fermer {0}', pickHint: 'Choisis' }}>
      <Panel title="Sac" onClose={() => {}}>
        <SplitPane list={<div />} />
      </Panel>
    </UiProvider>,
  );
  assert.match(html, /aria-label="Fermer Sac"/);
  assert.match(html, /Choisis/);
});

test('a tab strip marks the chosen tab and wraps on request', () => {
  const html = renderToString(
    <TabStrip
      wrap
      value="b"
      onChange={() => {}}
      tabs={[
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C', disabled: true, title: 'Locked' },
      ]}
    />,
  );
  assert.match(html, /class="e1681-tabs wrap"/);
  assert.match(html, /aria-selected="true" class="e1681-tab active"[^>]*>B</);
  assert.match(html, /disabled="" title="Locked"/);
});

test('a split pane shows its detail, or the empty word', () => {
  assert.match(renderToString(<SplitPane list="L" detail="D" listWidth="200px" />), /--e1681-split-list:200px/);
  assert.match(renderToString(<SplitPane list="L" empty="Nothing" />), /e1681-split-empty">Nothing</);
});

test('a select stacks every label so its button is as wide as the longest; its list is shut', () => {
  const html = renderToString(
    <Select
      value={2}
      onChange={() => {}}
      label="Channel"
      options={[
        { value: 1, label: 'Map' },
        { value: 2, label: 'World' },
      ]}
    />,
  );
  assert.match(html, /aria-hidden="true">Map</);
  assert.match(html, /class="shown" aria-hidden="false">World</);
  assert.doesNotMatch(html, /role="listbox"/);
});

test('glyphs, sliders, tooltips and pixel images render in whole pixels', () => {
  assert.match(renderToString(<Glyph id="close" scale={3} />), /width="21" height="21"/);
  assert.equal(renderToString(<Glyph id="no_such_glyph" />), '');
  const slider = renderToString(<Slider label="Volume" value={0.5} onChange={() => {}} />);
  assert.match(slider, /role="slider"/);
  assert.match(slider, /aria-valuetext="50%"/);
  assert.match(slider, /left:50%/);
  assert.match(renderToString(<Tooltip x={10} y={10}>tip</Tooltip>), /e1681-tooltip/);
  assert.match(renderToString(<PixelImage src="a.png" width={64} height={64} />), /visibility:hidden/);
});

test('the confirm dialog shows the open question with a quantity, and nothing otherwise', async () => {
  assert.equal(renderToString(<ConfirmDialog />), '');
  const answer = askQuantity('Sell how many?', 20, { ok: 'Sell' });
  const html = renderToString(<ConfirmDialog />);
  assert.match(html, /role="alertdialog"/);
  assert.match(html, /Sell how many\?/);
  assert.match(html, />Sell</);
  assert.match(html, />Cancel</);
  assert.match(html, /aria-valuemax="20"/);
  cancelConfirm();
  assert.equal(await answer, 0);
});

test('the choice dialog lists its options', async () => {
  const answer = askChoice('Pick one', [
    { id: 'a', label: 'Alpha', note: '1' },
    { id: 'b', label: 'Beta' },
  ]);
  const html = renderToString(<ChoiceDialog />);
  assert.match(html, /Alpha/);
  assert.match(html, /e1681-choice-note">1</);
  assert.match(html, />Choose</);
  cancelChoice();
  assert.equal(await answer, null);
});

test('useStore reads an engine store', () => {
  const store = createStore({ hp: 7, name: 'x' });
  function Hp() {
    return <b>{useStore(store, (s) => s.hp)}</b>;
  }
  assert.equal(renderToString(<Hp />), '<b>7</b>');
});

test('a game hangs its own class names beside the kit’s, states included', () => {
  const html = renderToString(
    <UiProvider touch={false} classNames={{ tabs: 'tabs', tab: 'tab', active: 'on', split: 'split-pane', button: 'btn' }}>
      <TabStrip tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} value="a" onChange={() => {}} />
      <SplitPane list={<div />} detail={null} />
    </UiProvider>,
  );
  assert.match(html, /class="e1681-tabs tabs"/);
  assert.match(html, /class="e1681-tab tab active on"/);
  assert.match(html, /class="e1681-tab tab"/);
  assert.match(html, /class="e1681-split split-pane"/);
  // without a provider nothing is added
  assert.match(renderToString(<TabStrip tabs={[{ id: 'a', label: 'A' }]} value="a" onChange={() => {}} />), /class="e1681-tabs"/);
});
