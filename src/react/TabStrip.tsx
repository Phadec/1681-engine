import type { CSSProperties, PointerEvent, ReactNode } from 'react';

export interface Tab<T extends string> {
  id: T;
  label: ReactNode;
  /** Why a disabled tab cannot be taken. */
  title?: string;
  disabled?: boolean;
  /** The tab's own colour for its label, kept on both states. */
  color?: string;
}

export interface TabStripProps<T extends string> {
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  /** The short strip that sits over a field or in a row of controls. */
  small?: boolean;
  /** Breaks onto more rows instead of scrolling sideways (same as `className="wrap"`). */
  wrap?: boolean;
  className?: string;
  /** What the strip chooses, for a screen reader. */
  label?: string;
  /** Lets a strip beside a text field keep the keyboard open (`e.preventDefault()`). */
  onPointerDown?: (e: PointerEvent) => void;
}

/**
 * One strip of tabs: the chosen one lifted and open into the pane below, the rest a step lower. Every row of tabs —
 * a window's sections, a filter, a difficulty — goes through here so they all read the same; never a row of buttons
 * or a `<select>`. A strip too long for one row takes `wrap` (or `className="wrap"`).
 */
export function TabStrip<T extends string>({ tabs, value, onChange, small, wrap, className, label, onPointerDown }: TabStripProps<T>) {
  const classes = ['e1681-tabs', small ? 'small' : '', wrap ? 'wrap' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={classes} role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const style: CSSProperties | undefined = t.color ? { color: t.color } : undefined;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === value}
            className={t.id === value ? 'e1681-tab active' : 'e1681-tab'}
            style={style}
            disabled={t.disabled}
            title={t.title}
            // a mouse takes a tab the moment it is pressed, or it lags a beat behind the hand; a finger only on a tap
            // (the click, which the browser never sends after a scroll), since a finger also presses to scroll the strip
            onPointerDown={(e) => {
              onPointerDown?.(e);
              if (e.pointerType === 'mouse' && e.button === 0 && !t.disabled && t.id !== value) onChange(t.id);
            }}
            onClick={() => {
              if (t.id !== value) onChange(t.id);
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
