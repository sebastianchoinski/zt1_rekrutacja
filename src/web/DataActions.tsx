import { useEffect, useId, useRef, useState } from 'react';
import { Chevron } from './Chevron.js';
import s from './DataActions.module.scss';

export function DataActions({
  disabled,
  onEditJson,
  onRestoreExample,
}: {
  disabled: boolean;
  onEditJson: () => void;
  onRestoreExample: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);

  useEffect(() => {
    if (disabled && ref.current) ref.current.open = false;
  }, [disabled]);

  const choose = (action: () => void) => {
    ref.current!.open = false;
    trigger.current?.focus();
    action();
  };

  return (
    <details
      ref={ref}
      className={s.actions}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.preventDefault();
          event.currentTarget.open = false;
          trigger.current?.focus();
        }
      }}
    >
      <summary
        ref={trigger}
        role="button"
        className={`secondary ${s.trigger}`}
        aria-controls={id}
        aria-expanded={open}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        Dane <Chevron />
      </summary>
      <div
        id={id}
        className={s.menu}
        role="group"
        aria-label="Dane kalkulacji"
        onMouseDown={(event) => event.preventDefault()}
      >
        <button type="button" disabled={disabled} onClick={() => choose(onEditJson)}>
          Edytuj JSON
        </button>
        <button type="button" disabled={disabled} onClick={() => choose(onRestoreExample)}>
          Przywróć przykład
        </button>
      </div>
    </details>
  );
}
