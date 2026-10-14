import { useEffect, useState } from 'react';
import type { Size } from '../ui/layout/geometry';
import { useUi } from './UiProvider';

/** The `UiProvider`'s viewport, read again on every resize (only while `active`). */
export function useViewport(active = true): Size {
  const ui = useUi();
  const [size, setSize] = useState<Size>(() => ui.viewport());
  useEffect(() => {
    if (!active) return;
    const on = () => {
      const next = ui.viewport();
      setSize((s) => (s.width === next.width && s.height === next.height ? s : next));
    };
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [active, ui]);
  return size;
}
