// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { Field, Input, Select, Textarea } from '../index';

describe('Field label association', () => {
  it('binds the label to an input, a select and a textarea', () => {
    render(
      <form>
        <Field label="อีเมล">
          <Input type="email" />
        </Field>
        <Field label="แผนก">
          <Select>
            <option value="a">ก</option>
          </Select>
        </Field>
        <Field label="หมายเหตุ">
          <Textarea />
        </Field>
      </form>,
    );

    // Each control is reachable by its visible label — the association axe and a
    // screen reader both need, and which the unbound label used to lack.
    expect(screen.getByLabelText('อีเมล')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('แผนก')).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText('หมายเหตุ')).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('marks the control invalid and describes the error when one is set', () => {
    render(
      <Field label="รหัส" error="จำเป็นต้องกรอก">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('รหัส');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('จำเป็นต้องกรอก');
  });

  it('keeps a caller-provided id instead of overriding it', () => {
    render(
      <Field label="ชื่อ">
        <Input id="given-id" />
      </Field>,
    );
    expect(screen.getByLabelText('ชื่อ')).toHaveAttribute('id', 'given-id');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <form>
        <Field label="อีเมล" hint="เราจะไม่เปิดเผยอีเมลของคุณ">
          <Input type="email" />
        </Field>
      </form>,
    );
    await expectNoAxeViolations(container);
  });
});
