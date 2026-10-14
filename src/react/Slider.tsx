import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { quantize, sliderFraction, sliderValueAt } from '../ui/layout/slider';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  /** Spoken name (`aria-label`). */
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** What the value reads as, for the screen reader and the number beside the track (default: a percentage). */
  format?: (value: number) => string;
  /** Hides the number beside the track. */
  hideValue?: boolean;
  disabled?: boolean;
  className?: string;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

/** The value an arrow, Page or Home/End key moves a slider to; `undefined` for any other key. */
export function sliderKeyValue(key: string, value: number, min: number, max: number, step: number): number | undefined {
  const moves: Record<string, number> = {
    ArrowLeft: value - step,
    ArrowDown: value - step,
    ArrowRight: value + step,
    ArrowUp: value + step,
    PageDown: value - step * 4,
    PageUp: value + step * 4,
    Home: min,
    End: max,
  };
  const to = moves[key];
  return to === undefined ? undefined : quantize(to, min, max, step);
}

/**
 * A slider drawn by the theme instead of the browser's range: a sunk track, a fill and a square knob. Dragging,
 * pressing anywhere on the track and the arrow / Page / Home / End keys move it; it is a `role="slider"` with its aria
 * values, so it reads like the native range it replaces. Focused, it keeps the arrow keys from the game.
 */
export function Slider({ value, onChange, label, min = 0, max = 1, step = 0.05, format = percent, hideValue, disabled, className }: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const set = (v: number) => {
    if (v !== value) onChange(v);
  };
  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (r && r.width > 0) set(sliderValueAt(clientX, r.left, r.width, min, max, step));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    fromPointer(e.clientX);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientX);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = disabled ? undefined : sliderKeyValue(e.key, value, min, max, step);
    if (to === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    set(to);
  };
  const pct = sliderFraction(value, min, max) * 100;
  return (
    <div className={`e1681-slider-row${className ? ` ${className}` : ''}`}>
      <div
        className="e1681-slider"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <div className="e1681-slider-track" ref={track}>
          <div className="e1681-slider-fill" style={{ width: `${pct}%` }} />
          <div className="e1681-slider-knob" style={{ left: `${pct}%` }} />
        </div>
      </div>
      {!hideValue && <span className="e1681-slider-value">{format(value)}</span>}
    </div>
  );
}
