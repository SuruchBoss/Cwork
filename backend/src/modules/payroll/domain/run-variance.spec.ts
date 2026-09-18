import {
  computePayrollVariance,
  groundedAmounts,
  ungroundedAmounts,
  type RunSnapshot,
} from './run-variance';

const line = (
  employeeId: string,
  name: string,
  over: Partial<Omit<RunSnapshot['employees'][number], 'employeeId' | 'name'>> = {},
) => ({
  employeeId,
  name,
  netPay: 0,
  overtimeHours: 0,
  unpaidLeaveDays: 0,
  employerContribution: 0,
  ...over,
});

const run = (code: string, over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  code,
  currency: 'THB',
  totalGross: 0,
  totalDeduction: 0,
  totalNet: 0,
  totalEmployerCost: 0,
  employees: [],
  ...over,
});

describe('computePayrollVariance', () => {
  it('reports every total against the previous run with its movement', () => {
    const previous = run('2026-07', {
      totalGross: 600_000,
      totalDeduction: 60_000,
      totalNet: 540_000,
      totalEmployerCost: 30_000,
      employees: [line('a', 'A'), line('b', 'B')],
    });
    const current = run('2026-08', {
      totalGross: 660_000,
      totalDeduction: 66_000,
      totalNet: 594_000,
      totalEmployerCost: 33_000,
      employees: [line('a', 'A'), line('b', 'B')],
    });

    const v = computePayrollVariance(current, previous);

    expect(v.previousCode).toBe('2026-07');
    expect(v.totals.net).toEqual({ now: 594_000, previous: 540_000, delta: 54_000, percent: 10 });
    expect(v.totals.gross.delta).toBe(60_000);
    expect(v.totals.employerCost.percent).toBe(10);
  });

  it('reconciles: the net delta equals current net minus previous net', () => {
    const previous = run('2026-07', { totalNet: 540_000, employees: [line('a', 'A')] });
    const current = run('2026-08', { totalNet: 617_284.5, employees: [line('a', 'A')] });

    const v = computePayrollVariance(current, previous);
    expect(v.totals.net.delta).toBe(77_284.5);
    expect(v.totals.net.now! - v.totals.net.previous!).toBeCloseTo(v.totals.net.delta!, 2);
  });

  it('names joiners and leavers by comparing the two employee sets', () => {
    const previous = run('2026-07', {
      employees: [line('a', 'Stayed'), line('b', 'Left', { netPay: 25_000 })],
    });
    const current = run('2026-08', {
      employees: [line('a', 'Stayed'), line('c', 'Joined', { netPay: 30_000 })],
    });

    const v = computePayrollVariance(current, previous);
    expect(v.headcount).toMatchObject({ now: 2, previous: 2 });
    expect(v.headcount.joiners).toEqual([{ name: 'Joined', netPay: 30_000 }]);
    expect(v.headcount.leavers).toEqual([{ name: 'Left', netPay: 25_000 }]);
  });

  it('sums overtime, unpaid leave and employer contribution across the run', () => {
    const current = run('2026-08', {
      employees: [
        line('a', 'A', { overtimeHours: 8, unpaidLeaveDays: 1, employerContribution: 750 }),
        line('b', 'B', { overtimeHours: 4.5, unpaidLeaveDays: 0, employerContribution: 750 }),
      ],
    });
    const previous = run('2026-07', {
      employees: [line('a', 'A', { overtimeHours: 2, employerContribution: 750 })],
    });

    const v = computePayrollVariance(current, previous);
    expect(v.drivers.overtimeHours).toMatchObject({ now: 12.5, previous: 2, delta: 10.5 });
    expect(v.drivers.unpaidLeaveDays.now).toBe(1);
    expect(v.drivers.employerContribution).toMatchObject({ now: 1_500, previous: 750, delta: 750 });
  });

  it('reports nulls, not a fabricated comparison, when there is no previous run', () => {
    const current = run('2026-08', {
      totalNet: 100_000,
      employees: [line('a', 'A', { netPay: 100_000 })],
    });

    const v = computePayrollVariance(current, null);
    expect(v.previousCode).toBeNull();
    expect(v.totals.net).toEqual({ now: 100_000, previous: null, delta: null, percent: null });
    expect(v.headcount.previous).toBeNull();
    // Everyone is a joiner against nothing; nobody has left.
    expect(v.headcount.joiners).toHaveLength(1);
    expect(v.headcount.leavers).toHaveLength(0);
  });

  it('leaves percent undefined rather than dividing by zero', () => {
    const previous = run('2026-07', { totalEmployerCost: 0 });
    const current = run('2026-08', { totalEmployerCost: 5_000 });
    const v = computePayrollVariance(current, previous);
    expect(v.totals.employerCost).toMatchObject({
      now: 5_000,
      previous: 0,
      delta: 5_000,
      percent: null,
    });
  });
});

describe('the model narrates, it never computes', () => {
  const variance = computePayrollVariance(
    run('2026-08', {
      totalGross: 695_000,
      totalNet: 640_978,
      employees: [line('a', 'A'), line('b', 'B', { netPay: 30_000 })],
    }),
    run('2026-07', { totalGross: 600_000, totalNet: 540_000, employees: [line('a', 'A')] }),
  );

  it('accepts a narration that only states figures from the variance', () => {
    // net 640,978 now vs 540,000, up 100,978; one joiner earning 30,000.
    const honest =
      'ยอดจ่ายสุทธิงวดนี้ 640,978 บาท เพิ่มจาก 540,000 บาท คือ 100,978 บาท ' +
      'เพราะมีพนักงานเข้าใหม่ 1 คน รับสุทธิ 30,000 บาท';
    expect(ungroundedAmounts(honest, variance)).toEqual([]);
  });

  it('catches a figure the model invented that the tool never produced', () => {
    // 823,456 is nowhere in the variance — a fabricated total.
    const fabricated = 'ยอดรวมทั้งปีอยู่ที่ 823,456 บาท';
    expect(ungroundedAmounts(fabricated, variance)).toContain('823,456');
  });

  it('groundedAmounts offers both the raw and thousands-separated form of a figure', () => {
    const amounts = groundedAmounts(variance);
    expect(amounts.has('640978')).toBe(true);
    expect(amounts.has('640,978')).toBe(true);
  });
});
