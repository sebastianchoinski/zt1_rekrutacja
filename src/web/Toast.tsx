import { useEffect } from 'react';
import s from './Toast.module.scss';

export function Toast({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [onClose]);
  return (
    <div className={s.toast} role="status">
      <span className={s.check} aria-hidden="true">
        ✓
      </span>
      <span>Obliczono zapotrzebowanie</span>
      <button type="button" aria-label="Zamknij powiadomienie" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
