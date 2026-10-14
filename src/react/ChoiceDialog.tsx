import { useCallback, useEffect, useState } from 'react';
import { answerChoice, choiceStore, firstChoice, type ChoiceQuestion } from './choiceStore';
import { Modal } from './Modal';
import { useStore } from './useStore';
import { useUi } from './UiProvider';

const selectPending = (s: { pending: ChoiceQuestion | null }) => s.pending;

/**
 * The open `askChoice`, if any: mounted once at the UI's root. A row per option, the first that can be taken picked;
 * Enter takes the picked one, Esc or a press outside cancels.
 */
export function ChoiceDialog({ width = 400 }: { width?: number }) {
  const ui = useUi();
  const pending = useStore(choiceStore, selectPending);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(pending ? firstChoice(pending.options) : null), [pending]);
  const cancel = useCallback(() => answerChoice(null), []);
  const confirm = useCallback(() => {
    if (picked) answerChoice(picked);
  }, [picked]);
  if (!pending) return null;
  return (
    <Modal
      width={width}
      onCancel={cancel}
      onConfirm={confirm}
      className="e1681-choice"
      actions={
        <>
          <button type="button" className="e1681-button ghost" onClick={cancel}>
            {pending.cancel ?? ui.labels.cancel}
          </button>
          <button type="button" className="e1681-button" disabled={!picked} onClick={confirm}>
            {pending.confirm ?? ui.labels.choose}
          </button>
        </>
      }
    >
      <div className="e1681-confirm-text">{pending.text}</div>
      <div className="e1681-choice-list" role="listbox">
        {pending.options.map(({ id, label, icon, note, disabled }) => (
          <div
            key={id}
            role="option"
            aria-selected={picked === id}
            aria-disabled={disabled || undefined}
            className={`e1681-row e1681-pickable${picked === id ? ' picked' : ''}${disabled ? ' disabled' : ''}`}
            onClick={() => !disabled && setPicked(id)}
            onDoubleClick={() => !disabled && answerChoice(id)}
          >
            {icon !== undefined && <span className="e1681-choice-icon">{icon}</span>}
            <span className="e1681-choice-label">{label}</span>
            {note !== undefined && <span className="e1681-choice-note">{note}</span>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
