import { useId } from 'react';
import s from './DataEditor.module.scss';

export function NumberInput({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <span className={s.numberField}>
      <input
        aria-label={label}
        inputMode="decimal"
        type="text"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? id : undefined}
      />
      {error && (
        <small id={id} className={s.fieldError}>
          {error}
        </small>
      )}
    </span>
  );
}
