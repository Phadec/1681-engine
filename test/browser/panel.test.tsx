import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { Panel } from '../../src/react/Panel';
import { UiProvider } from '../../src/react/UiProvider';
import { injectBaseCss } from '../../src/react/baseCss';
import { SCROLL_CLASS } from '../../src/react/useFitToViewport';

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => injectBaseCss());
afterEach(async () => {
  root?.unmount();
  host?.remove();
  root = host = null;
  await page.viewport(800, 600);
});

const rows = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} style={{ height: 30 }}>row {i}</div>);
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function mount(node: ReactNode): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  flushSync(() => root!.render(<UiProvider touch={false}>{node}</UiProvider>));
  return host.querySelector<HTMLElement>('.e1681-panel')!;
}

function inside(el: HTMLElement, margin = 8): void {
  const r = el.getBoundingClientRect();
  expect(r.left).toBeGreaterThanOrEqual(margin);
  expect(r.top).toBeGreaterThanOrEqual(margin);
  expect(r.right).toBeLessThanOrEqual(window.innerWidth - margin);
  expect(r.bottom).toBeLessThanOrEqual(window.innerHeight - margin);
}

test('a small window stands centred on whole pixels', () => {
  const el = mount(<Panel title="Small" width={201}>{rows(2)}</Panel>);
  const r = el.getBoundingClientRect();
  expect(r.width).toBe(201);
  expect(Number.isInteger(r.left) && Number.isInteger(r.top)).toBe(true);
  expect(Math.abs(r.left + r.width / 2 - 400)).toBeLessThanOrEqual(1);
  expect(Math.abs(r.top + r.height / 2 - 300)).toBeLessThanOrEqual(1);
  expect(el.style.transform).toBe('');
});

test('a window too big for the screen is cut to it, keeps its header and scrolls its body', () => {
  const el = mount(<Panel title="Huge" width={2000}>{rows(100)}</Panel>);
  inside(el);
  const header = el.querySelector<HTMLElement>('.e1681-panel-header')!.getBoundingClientRect();
  expect(header.top).toBeGreaterThanOrEqual(8);
  expect(header.height).toBeGreaterThan(0);
  const body = el.querySelector<HTMLElement>(`.${SCROLL_CLASS}`)!;
  expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  expect(el.getBoundingClientRect().height).toBe(600 - 16);
});

test('a window asked to stand off the edge is moved back inside', () => {
  const el = mount(<Panel title="Off" width={300} at={{ x: 700, y: 550 }}>{rows(3)}</Panel>);
  inside(el);
  expect(el.getBoundingClientRect().right).toBe(800 - 8);
});

test('the body keeps its scroll when the window is placed again', async () => {
  const el = mount(<Panel title="Scroll" width={300}>{rows(100)}</Panel>);
  const body = el.querySelector<HTMLElement>(`.${SCROLL_CLASS}`)!;
  body.scrollTop = 400;
  flushSync(() => root!.render(<UiProvider touch={false}><Panel title="Scroll again" width={300}>{rows(100)}</Panel></UiProvider>));
  await frame();
  expect(body.scrollTop).toBe(400);
});

test('a window is fitted again when the browser window shrinks', async () => {
  const el = mount(<Panel title="Resize" width={500}>{rows(10)}</Panel>);
  inside(el);
  await page.viewport(320, 240);
  await frame();
  await frame();
  expect(window.innerWidth).toBe(320);
  inside(el);
  expect(el.getBoundingClientRect().width).toBe(320 - 16);
});

test('a window whose content grows outside React is fitted again', async () => {
  const el = mount(<Panel title="Grow" width={300}><div className="grow" style={{ height: 40 }} /></Panel>);
  const before = el.getBoundingClientRect().height;
  expect(before).toBeLessThan(200);
  el.querySelector<HTMLElement>('.grow')!.style.height = '2000px';
  await frame();
  await frame();
  inside(el);
  expect(el.getBoundingClientRect().height).toBe(600 - 16);
});
