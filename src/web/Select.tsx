import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import s from './Select.module.scss';

interface Option {
  value: string;
  label: string;
  detail?: string;
  custom?: boolean;
}
interface Props {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  align?: 'left' | 'center';
  error?: string;
}

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Wybierz…',
  disabled,
  allowCustom = false,
  align = 'left',
  error,
}: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const focusCustom = useRef(false);
  const previousValue = useRef(value);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const [active, setActive] = useState(0);
  const isCustomValue = (candidate: string) =>
    allowCustom &&
    candidate !== '' &&
    !options.some((option) => option.value === candidate && !option.custom);
  const [custom, setCustom] = useState(() => isCustomValue(value));
  const choices = allowCustom
    ? [...options, { value: null, label: 'Własna', detail: undefined }]
    : options;
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const scroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open, id]);

  const show = () => {
    const rect = root.current!.firstElementChild!.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const above = below < Math.min(choices.length * 38 + 10, 250) && rect.top > below;
    const width = Math.min(Math.max(rect.width, allowCustom ? 160 : 0), window.innerWidth - 24);
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
      top: above ? 'auto' : rect.bottom + 6,
      bottom: above ? window.innerHeight - rect.top + 6 : 'auto',
    });
    setActive(
      custom
        ? choices.length - 1
        : Math.max(
            0,
            choices.findIndex((option) => option.value === value),
          ),
    );
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = choices[index];
    if (!option) return;
    if (option.value === null) {
      if (!custom) {
        previousValue.current = value;
        onChange('');
      }
      focusCustom.current = true;
      setCustom(true);
      root.current?.querySelector('input')?.focus();
    } else {
      previousValue.current = option.value;
      onChange(option.value);
      focusCustom.current = isCustomValue(option.value);
      setCustom(isCustomValue(option.value));
      if (!isCustomValue(option.value)) button.current?.focus();
    }
    setOpen(false);
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (custom && !open) {
        onChange(previousValue.current);
        setCustom(isCustomValue(previousValue.current));
        if (!isCustomValue(previousValue.current)) button.current?.focus();
      }
      setOpen(false);
      return;
    }
    if (custom && event.key === 'Enter' && !open) {
      event.preventDefault();
      if (value.trim()) {
        previousValue.current = value.trim();
        onChange(value.trim());
      }
      return;
    }
    if (event.key === 'Enter' || (!custom && event.key === ' ')) {
      event.preventDefault();
      if (open) choose(active);
      else show();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();
      else
        setActive(
          (index) =>
            (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) %
            Math.max(1, choices.length),
        );
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (custom && !open) return;
      event.preventDefault();
      if (!open) show();
      setActive(event.key === 'Home' ? 0 : Math.max(0, choices.length - 1));
      return;
    }
    if (!custom && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const text =
        (now - search.current.time < 600 ? search.current.text : '') +
        event.key.toLocaleLowerCase('pl');
      search.current = { text, time: now };
      const index = choices.findIndex((option) =>
        option.label.toLocaleLowerCase('pl').startsWith(text),
      );
      if (index >= 0) {
        if (!open) show();
        setActive(index);
      }
    }
  };

  return (
    <div
      ref={root}
      className={`${s.select} ${align === 'center' ? s.centered : ''}`}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
        if (custom && value.trim()) {
          previousValue.current = value.trim();
          onChange(value.trim());
        }
      }}
    >
      <div className={custom ? s.customTrigger : undefined} data-invalid={!!error}>
        {custom && (
          <input
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-autocomplete="none"
            aria-haspopup="listbox"
            aria-controls={open ? `${id}-list` : undefined}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            aria-activedescendant={open ? `${id}-${active}` : undefined}
            value={value}
            disabled={disabled}
            maxLength={80}
            placeholder="np. opak"
            autoFocus={focusCustom.current}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(false);
            }}
            onKeyDown={keyDown}
          />
        )}
        <button
          ref={button}
          type="button"
          role={custom ? undefined : 'combobox'}
          aria-label={custom ? 'Wybierz jednostkę z listy' : label}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? `${id}-list` : undefined}
          aria-invalid={!custom && error ? true : undefined}
          aria-describedby={!custom && error ? `${id}-error` : undefined}
          aria-activedescendant={!custom && open ? `${id}-${active}` : undefined}
          disabled={disabled || choices.length === 0}
          className={custom ? undefined : s.trigger}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={keyDown}
        >
          {!custom && (
            <>
              <span>{selected?.label ?? (allowCustom && value ? value : placeholder)}</span>
              {selected?.detail && <small>{selected.detail}</small>}
            </>
          )}
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      {error && (
        <small id={`${id}-error`} className={s.error}>
          {error}
        </small>
      )}
      {open &&
        createPortal(
          <ul
            ref={menu}
            id={`${id}-list`}
            role="listbox"
            aria-label={label}
            className={s.list}
            style={position}
          >
            {choices.map((option, index) => (
              <li
                id={`${id}-${index}`}
                key={option.value === null ? 'custom' : `value-${option.value}`}
                role="option"
                aria-selected={custom ? option.value === null : option.value === value}
                data-active={index === active}
                onPointerMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.detail && <small>{option.detail}</small>}
                <span className={s.check} aria-hidden="true">
                  {(custom ? option.value === null : option.value === value) ? '✓' : ''}
                </span>
              </li>
            ))}
          </ul>,
          root.current?.closest('main') ?? document.body,
        )}
    </div>
  );
}
