import { useEffect, useState } from 'react';
import { Tooltip } from './Tooltip';
import { useUi } from './UiProvider';

export interface TitleTipsProps {
  /** How long the pointer rests on an element before its tip shows (default 350 ms). */
  delayMs?: number;
  /** Only elements inside this one (default: the whole document). */
  root?: () => HTMLElement | null;
  className?: string;
}

type Tip = { text: string; x: number; y: number };

/**
 * Every `title=` drawn as the kit's `Tooltip` instead of the browser's. Mounted once: the element under the pointer
 * has its `title` taken off while the pointer stays on it (so the browser shows nothing) and put back when it leaves,
 * so components keep writing plain `title=` and React's diffing never sees a change. Pointer events, not mouse
 * events, because a disabled button fires only those. Desktop only: a touch screen never showed a title.
 */
export function TitleTips({ delayMs = 350, root, className }: TitleTipsProps) {
  const ui = useUi();
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    if (ui.touch || typeof document === 'undefined') return;
    let el: HTMLElement | null = null;
    let text = '';
    let timer = 0;
    let shown = false;
    let at = { x: 0, y: 0 };
    const scope = () => root?.() ?? document.documentElement;

    // takes the title off `el` (again, if React wrote a new one meanwhile) and keeps its text
    const take = () => {
      if (!el) return;
      const t = el.getAttribute('title');
      if (t !== null) {
        el.removeAttribute('title');
        text = t;
        if (shown) setTip(text ? { text, ...at } : null);
      }
    };
    const release = () => {
      window.clearTimeout(timer);
      if (el && el.isConnected && !el.hasAttribute('title') && text) el.setAttribute('title', text);
      el = null;
      text = '';
      shown = false;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const next = (e.target as Element | null)?.closest?.('[title]') as HTMLElement | null;
      if (!next || next === el || !scope().contains(next)) return;
      release();
      el = next;
      at = { x: e.clientX, y: e.clientY };
      take();
      if (!text) return;
      timer = window.setTimeout(() => {
        shown = true;
        setTip({ text, ...at });
      }, delayMs);
    };
    const move = (e: PointerEvent) => {
      if (!el) return;
      if (!el.isConnected) return release();
      at = { x: e.clientX, y: e.clientY };
      take();
      if (shown) setTip(text ? { text, ...at } : null);
    };
    const out = (e: PointerEvent) => {
      if (!el) return;
      const to = e.relatedTarget as Node | null;
      if (to && el.contains(to)) return;
      release();
    };
    // a press hides it, as the browser's own did, until the pointer leaves and comes back
    const press = () => {
      window.clearTimeout(timer);
      shown = false;
      setTip(null);
    };

    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerout', out, true);
    document.addEventListener('pointerdown', press, true);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('pointerdown', press, true);
      window.removeEventListener('blur', release);
      release();
    };
  }, [ui.touch, delayMs, root]);

  if (!tip) return null;
  return (
    <Tooltip x={tip.x} y={tip.y} {...(className ? { className } : {})}>
      <div className="e1681-title-tip">{tip.text}</div>
    </Tooltip>
  );
}
