import { useState, type ReactNode } from 'react';
import { useCx, useUi } from './UiProvider';
import { DEFAULT_LABELS } from './labels';

export interface ConfirmButtonProps {
  /** What this button arms, among the ones sharing `armed` (a name, "disband"…). */
  armKey?: string;
  /**
   * Which button of a group is armed now, kept by the parent so arming one disarms the others. Left out, the button
   * keeps its own state.
   */
  armed?: string | null;
  setArmed?: (key: string | null) => void;
  onConfirm: () => void;
  label: ReactNode;
  /** Shown once armed: what the second click will do (default `UiLabels.confirmAgain`). */
  armedLabel?: ReactNode;
  title?: string;
  /** Default `'small'`. */
  className?: string;
  disabled?: boolean;
}

/**
 * A button asked twice: the first click arms it (it takes the `armed` look and says so), the second does the thing.
 * For what cannot be undone from a list row — removing a friend, disbanding a group — where a dialog would be heavier
 * than the choice.
 */
export function ConfirmButton({ armKey = 'armed', armed, setArmed, onConfirm, label, armedLabel, title, className = 'small', disabled }: ConfirmButtonProps) {
  const cx = useCx();
  const ui = useUi();
  const [own, setOwn] = useState<string | null>(null);
  const controlled = setArmed !== undefined;
  const current = controlled ? (armed ?? null) : own;
  const set = controlled ? setArmed : setOwn;
  const on = current === armKey;
  return (
    <button
      type="button"
      className={cx('e1681-button', className, on ? 'e1681-armed primary' : 'ghost')}
      disabled={disabled}
      onClick={() => {
        if (!on) return set(armKey);
        onConfirm();
        set(null);
      }}
      title={title}
    >
      {on ? (armedLabel ?? ui.labels.confirmAgain ?? DEFAULT_LABELS.confirmAgain) : label}
    </button>
  );
}
