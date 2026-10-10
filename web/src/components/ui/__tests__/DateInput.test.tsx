// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/stores/ui.store';
import { expectBuddhistEraYears, expectNoAxeViolations } from '@/test/a11y';
import { DateInput } from '../DateInput';
import { Field } from '../index';

/** A field as a page holds one: the page keeps the ISO value, read here off an attribute. */
function Holder({
  initial = '',
  onChange,
  min,
}: {
  initial?: string;
  onChange?: (v: string) => void;
  min?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Field label="วันเริ่ม">
        <DateInput
          value={value}
          min={min}
          onChange={(next) => {
            setValue(next);
            onChange?.(next);
          }}
        />
      </Field>
      <span data-testid="stored" data-value={value} />
    </>
  );
}

beforeEach(() => useUiStore.setState({ language: 'th' }));
afterEach(() => useUiStore.setState({ language: 'th' }));

describe('A Thai date field (CW-058)', () => {
  it('shows the date day first in the Buddhist era', async () => {
    const { container } = render(<Holder initial="2026-10-01" />);

    expect(screen.getByLabelText('วันเริ่ม')).toHaveValue('1 ต.ค. 2569');
    await expectNoAxeViolations(container);
  });

  it('stores the ISO date of what is typed', async () => {
    const onChange = vi.fn();
    render(<Holder onChange={onChange} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('วันเริ่ม'), '1/10/2569');
    expect(onChange).not.toHaveBeenCalled();
    await user.tab();

    expect(onChange).toHaveBeenCalledWith('2026-10-01');
    expect(screen.getByLabelText('วันเริ่ม')).toHaveValue('1 ต.ค. 2569');
  });

  it('says how to write a date it cannot read, and keeps the value', async () => {
    const onChange = vi.fn();
    render(<Holder initial="2026-10-01" onChange={onChange} />);
    const user = userEvent.setup();
    const field = screen.getByLabelText('วันเริ่ม');

    await user.clear(field);
    await user.type(field, '31/2/2569{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('พิมพ์วันที่เป็น วัน/เดือน/ปี พ.ศ. เช่น 1/10/2569');
    expect(screen.getByTestId('stored')).toHaveAttribute('data-value', '2026-10-01');
  });

  it('clears the value when the field is emptied', async () => {
    render(<Holder initial="2026-10-01" />);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('วันเริ่ม'));
    await user.tab();

    expect(screen.getByTestId('stored')).toHaveAttribute('data-value', '');
  });

  it('picks a day from a calendar written in Buddhist-era years', async () => {
    const { container } = render(<Holder initial="2026-10-01" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'เลือกวันที่' }));
    const calendar = screen.getByRole('dialog', { name: 'ตุลาคม 2569' });
    expect(calendar).toBeInTheDocument();
    // The chosen day takes focus, so the keyboard starts where the value is.
    expect(screen.getByRole('button', { name: 'วันพฤหัสบดีที่ 1 ตุลาคม 2569' })).toHaveFocus();
    await expectNoAxeViolations(container);

    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('stored')).toHaveAttribute('data-value', '2026-10-08');
    expect(screen.getByLabelText('วันเริ่ม')).toHaveValue('8 ต.ค. 2569');
    expect(screen.getByRole('button', { name: 'เลือกวันที่' })).toHaveFocus();
  });

  it('turns the month and closes on Escape', async () => {
    render(<Holder initial="2026-10-01" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'เลือกวันที่' }));
    await user.click(screen.getByRole('button', { name: 'เดือนถัดไป' }));
    expect(screen.getByRole('dialog', { name: 'พฤศจิกายน 2569' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('stored')).toHaveAttribute('data-value', '2026-10-01');
  });

  it('does not offer days before the earliest allowed', async () => {
    render(<Holder initial="2026-10-10" min="2026-10-05" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'เลือกวันที่' }));

    expect(screen.getByRole('button', { name: 'วันอาทิตย์ที่ 4 ตุลาคม 2569' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'วันจันทร์ที่ 5 ตุลาคม 2569' })).toBeEnabled();
  });

  it("keeps the browser's own field in English", () => {
    useUiStore.setState({ language: 'en' });
    render(<Holder initial="2026-10-01" />);

    const field = screen.getByLabelText('วันเริ่ม');
    expect(field).toHaveAttribute('type', 'date');
    expect(field).toHaveValue('2026-10-01');
  });
});

describe('The check for Gregorian years on a Thai screen (CW-058)', () => {
  it('fails on a Thai month with a Gregorian year, an ISO date or a period code', () => {
    for (const text of ['28 ก.ย. 2026', 'สิงหาคม 2026', 'จ่าย 2026-10-01', 'งวด 2026-08']) {
      const { container, unmount } = render(<p>{text}</p>);
      expect(() => expectBuddhistEraYears(container), text).toThrow();
      unmount();
    }
  });

  it('passes Buddhist-era years and numbers that only look like years', () => {
    const { container } = render(<p>28 ก.ย. 2569 · PAY-2026-00009 · ฿2,026.00</p>);
    expect(() => expectBuddhistEraYears(container)).not.toThrow();
  });
});
