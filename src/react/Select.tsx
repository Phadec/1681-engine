import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listWidth } from '../ui/layout/listWidth';
import { scrollIntoView } from '../ui/layout/scroll';
import { Glyph } from './Glyph';
import { listPlacement, type ListPlacement } from './placement';
import { useUi, useCx } from './UiProvider';

export interface SelectOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

export interface SelectProps<T extends string | number> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** What it chooses, for a screen reader. */
  label?: string;
  /** Fills its row, cutting the label with an ellipsis instead of growing. */
  grow?: boolean;
  className?: string;
  disabled?: boolean;
}

/** The next option along the list, wrapping round. */
export function stepOption(index: number, step: number, count: number): number {
  return count > 0 ? (((Math.max(0, index) + step) % count) + count) % count : 0;
}

/**
 * A drop-down drawn by the theme instead of the browser's `<select>`, whose list is the OS's own widget and whose box
 * clips its text at a fixed width. The button is as wide as its longest label (every label stacked in one cell, the
 * picked one shown). The list opens in a portal, so no window's `overflow` cuts it: as wide as its longest label
 * (`listWidth`), under the button or over it when the screen ends below (`listPlacement`). A press never takes the
 * focus, so a text field beside it keeps its keyboard.
 */
export function Select<T extends string | number>({ value, options, onChange, label, grow, className, disabled }: SelectProps<T>) {
  const cx = useCx();
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<(ListPlacement & { width: number }) | null>(null);
  const [hot, setHot] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const picked = options.findIndex((o) => o.value === value);

  // first rendered hidden at its natural size, then measured and placed
  useLayoutEffect(() => {
    const list = listRef.current;
    const button = buttonRef.current;
    if (!open || !list || !button || place) return;
    const rows = Array.from(list.children) as HTMLElement[];
    const widest = rows.reduce((w, r) => Math.max(w, r.offsetWidth), 0);
    const view = ui.viewport();
    const width = listWidth(
      rows.map((_, i) => String(i)),
      (i) => rows[Number(i)]?.offsetWidth ?? 0,
      { padding: list.offsetWidth - widest, min: Math.round(button.offsetWidth), max: view.width - 2 * ui.margin },
    );
    const r = button.getBoundingClientRect();
    const at = listPlacement({ x: r.left, y: r.top, width: r.width, height: r.height }, { width, height: list.offsetHeight }, view, 2, ui.margin);
    setPlace({ ...at, width });
  }, [open, place, ui]);

  // the option moved to by the keyboard is scrolled into view, no further
  useEffect(() => {
    const list = listRef.current;
    const row = list?.children[hot] as HTMLElement | undefined;
    if (list && row) list.scrollTop = scrollIntoView(list.scrollTop, row.offsetTop, row.offsetHeight, list.clientHeight, list.scrollHeight);
  }, [hot, place]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const shut = () => setOpen(false);
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', shut);
    };
  }, [open]);

  const show = (on: boolean) => {
    setPlace(null);
    setOpen(on);
  };
  const choose = (i: number) => {
    const o = options[i];
    show(false);
    if (o && o.value !== value) onChange(o.value);
  };
  const toggle = () => {
    if (disabled) return;
    setHot(Math.max(0, picked));
    show(!open);
  };
  const onKey = (e: KeyboardEvent) => {
    // the game's own keys never see what is pressed here
    e.stopPropagation();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      if (open) setHot((h) => stepOption(h, step, options.length));
      else choose(stepOption(picked, step, options.length));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) choose(hot);
      else toggle();
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      show(false);
    }
  };

  const target = ui.portal();
  const list = (
    <div
      ref={listRef}
      className={cx(`e1681-select-list e1681-tip-frame${place ? '' : ' measuring'}`)}
      role="listbox"
      aria-label={label}
      style={place ? { left: place.x, top: place.y, width: place.width, maxHeight: place.height } : { left: 0, top: 0, visibility: 'hidden' }}
      onPointerDown={(e) => e.preventDefault()}
    >
      {options.map((o, i) => (
        <div
          key={String(o.value)}
          role="option"
          aria-selected={i === picked}
          className={cx(`e1681-select-option${i === picked ? ' picked' : ''}${i === hot ? ' hot' : ''}`)}
          onPointerEnter={() => setHot(i)}
          onClick={() => choose(i)}
        >
          {o.label}
        </div>
      ))}
    </div>
  );
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cx(`e1681-select${open ? ' open' : ''}${grow ? ' grow' : ''}${className ? ` ${className}` : ''}`)}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onPointerDown={(e) => e.preventDefault()}
        onClick={toggle}
        onKeyDown={onKey}
      >
        <span className={cx('e1681-select-labels')}>
          {options.map((o, i) => (
            <span key={String(o.value)} className={cx(i === picked ? 'shown' : undefined)} aria-hidden={i !== picked}>
              {o.label}
            </span>
          ))}
        </span>
        <Glyph id={open ? 'up' : 'down'} />
      </button>
      {open && (target ? createPortal(list, target) : list)}
    </>
  );
}
