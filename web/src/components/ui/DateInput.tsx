// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { addMonths, format, parseISO, startOfMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { formatDate, formatMonthYear, parseThaiDate, toIsoDate } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { useUiStore } from '@/stores/ui.store';
import { Icon } from './icons';

export interface DateInputProps {
  /** The date as the API writes it, 2026-10-01, or '' for none. */
  value: string;
  /** Called with the new ISO date, or '' when the field is cleared. */
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
}

/**
 * A date field (CW-058). The browser's own date input writes the date the way
 * the computer's locale does, often month first and always in the Gregorian
 * year, so in Thai this field is text written and read as Thai offices write a
 * date: day first, Buddhist-era year, "1 ต.ค. 2569", with a calendar to pick
 * from. Its value is still the API's ISO date. English keeps the browser's
 * input, unchanged.
 */
export function DateInput(props: DateInputProps) {
  const language = useUiStore((s) => s.language);
  if (language === 'en') {
    const { value, onChange, ...rest } = props;
    return (
      <input
        {...rest}
        type="date"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return <ThaiDateInput {...props} />;
}

const display = (iso: string) => (iso ? formatDate(iso, 'd MMM yyyy') : '');

function ThaiDateInput({
  value,
  onChange,
  min,
  max,
  id,
  autoFocus,
  disabled,
  'aria-describedby': describedBy,
  'aria-invalid': invalidFromField,
  'aria-label': ariaLabel,
}: DateInputProps) {
  const t = useT();
  const autoId = useId();
  const inputId = id ?? autoId;
  const problemId = `${inputId}-format`;
  const [text, setText] = useState(() => display(value));
  const [unreadable, setUnreadable] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // A new value from outside (a reset, a date picked elsewhere) replaces what is shown.
  useEffect(() => {
    setText(display(value));
    setUnreadable(false);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  /** Reads what was typed: a date becomes the value, blank clears it, anything else is flagged. */
  const commit = () => {
    if (!text.trim()) {
      setUnreadable(false);
      if (value) onChange('');
      return;
    }
    const iso = parseThaiDate(text);
    if (!iso) {
      setUnreadable(true);
      return;
    }
    setUnreadable(false);
    setText(display(iso));
    if (iso !== value) onChange(iso);
  };

  const pick = (iso: string) => {
    setOpen(false);
    setUnreadable(false);
    setText(display(iso));
    if (iso !== value) onChange(iso);
    toggle.current?.focus();
  };

  return (
    <div className="date-input" ref={wrapper}>
      <div className="date-input__row">
        <input
          id={inputId}
          className="input"
          inputMode="text"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={t('day/month/year')}
          aria-label={ariaLabel}
          aria-invalid={unreadable || invalidFromField || undefined}
          aria-describedby={
            [describedBy, unreadable ? problemId : undefined].filter(Boolean).join(' ') || undefined
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        <button
          ref={toggle}
          type="button"
          className="btn btn--secondary date-input__toggle"
          aria-label={t('Choose a date')}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="calendar" size={16} />
        </button>
      </div>
      {unreadable && (
        <div id={problemId} className="field__error" role="alert">
          {t('Write the date as day/month/year, for example {example}', { example: '1/10/2569' })}
        </div>
      )}
      {open && (
        <Calendar
          value={value}
          min={min}
          max={max}
          onPick={pick}
          onClose={() => {
            setOpen(false);
            toggle.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** Sunday first, as Thai calendars are printed. */
const WEEKDAYS = Array.from({ length: 7 }, (_, day) => {
  const date = new Date(2026, 2, 1 + day); // 1 March 2026 is a Sunday
  return {
    short: format(date, 'EEEEEE', { locale: th }),
    long: format(date, 'EEEE', { locale: th }),
  };
});

function Calendar({
  value,
  min,
  max,
  onPick,
  onClose,
}: {
  value: string;
  min?: string;
  max?: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const captionId = useId();
  const today = toIsoDate(new Date());
  const [focused, setFocused] = useState(() => value || (min && min > today ? min : today));
  const month = startOfMonth(parseISO(focused));
  const grid = useRef<HTMLTableElement>(null);

  // The focused day keeps keyboard focus as it moves, across months too.
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  }, [focused]);

  const outOfRange = (iso: string) => Boolean((min && iso < min) || (max && iso > max));
  const shift = (days: number) => {
    const next = parseISO(focused);
    next.setDate(next.getDate() + days);
    setFocused(toIsoDate(next));
  };
  const shiftMonth = (months: number) =>
    setFocused(toIsoDate(addMonths(parseISO(focused), months)));

  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, () => void> = {
      ArrowLeft: () => shift(-1),
      ArrowRight: () => shift(1),
      ArrowUp: () => shift(-7),
      ArrowDown: () => shift(7),
      PageUp: () => shiftMonth(-1),
      PageDown: () => shiftMonth(1),
    };
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (moves[event.key]) {
      event.preventDefault();
      moves[event.key]();
    }
  };

  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: days }, (_, i) =>
      toIsoDate(new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  return (
    <div
      className="date-input__calendar"
      role="dialog"
      aria-labelledby={captionId}
      onKeyDown={onKeyDown}
    >
      <div className="date-input__head">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-label={t('Previous month')}
          onClick={() => shiftMonth(-1)}
        >
          <Icon name="chevronLeft" size={16} />
        </button>
        <span id={captionId} className="date-input__caption" aria-live="polite">
          {formatMonthYear(month.getFullYear(), month.getMonth() + 1)}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-label={t('Next month')}
          onClick={() => shiftMonth(1)}
        >
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
      <table ref={grid} className="date-input__grid">
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day.long} scope="col" abbr={day.long}>
                {day.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((iso, d) => (
                <td key={iso ?? `blank-${w}-${d}`}>
                  {iso && (
                    <button
                      type="button"
                      data-day={iso}
                      className="date-input__day"
                      tabIndex={iso === focused ? 0 : -1}
                      aria-label={formatDate(iso, "'วัน'EEEE'ที่' d MMMM yyyy")}
                      aria-pressed={iso === value}
                      aria-current={iso === today ? 'date' : undefined}
                      disabled={outOfRange(iso)}
                      onClick={() => onPick(iso)}
                    >
                      {Number(iso.slice(8))}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
