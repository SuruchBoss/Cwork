/**
 * What changed between one payroll run and the period before it — computed, not
 * narrated (CW-040).
 *
 * A run approver did not prepare the run. What they are shown is a set of
 * totals and no practical way to interrogate them, so the separation-of-duties
 * control is real on paper and thin in practice. This turns the totals into a
 * variance against the previous period, broken down by the drivers the payslip
 * already records — headcount, overtime, unpaid leave and employer cost — so
 * the approver can see *why* the net moved before they sign it.
 *
 * It is a pure function on purpose. Every figure the assistant is allowed to
 * say comes from here; the model narrates this object and computes nothing of
 * its own. `groundedAmounts` below is what proves that: a number in the
 * narration that is not in this output is a fabrication, and a test can catch
 * it (see run-variance.spec.ts).
 */

/** One employee's line in a run, reduced to the fields a variance needs. */
export interface EmployeeRunLine {
  employeeId: string;
  name: string;
  netPay: number;
  overtimeHours: number;
  unpaidLeaveDays: number;
  /** Employer-side cost for this person — SSO and provident-fund employer share. */
  employerContribution: number;
}

/** A run reduced to what a variance is computed from. Totals are the run's own. */
export interface RunSnapshot {
  code: string;
  currency: string;
  totalGross: number;
  totalDeduction: number;
  totalNet: number;
  totalEmployerCost: number;
  employees: EmployeeRunLine[];
}

/** A single figure alongside its previous value and the movement between them. */
export interface Movement {
  now: number;
  previous: number | null;
  /** now − previous, or null when there is no previous run to compare against. */
  delta: number | null;
  /** Percentage change to one decimal place, or null when it is not defined. */
  percent: number | null;
}

export interface PayrollVariance {
  currentCode: string;
  previousCode: string | null;
  currency: string;
  headcount: {
    now: number;
    previous: number | null;
    joiners: { name: string; netPay: number }[];
    leavers: { name: string; netPay: number }[];
  };
  totals: {
    gross: Movement;
    deduction: Movement;
    net: Movement;
    employerCost: Movement;
  };
  drivers: {
    overtimeHours: Movement;
    unpaidLeaveDays: Movement;
    employerContribution: Movement;
  };
}

/** Rounds to two decimal places, the resolution money is stored and shown at. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function movement(now: number, previous: number | null): Movement {
  if (previous === null) {
    return { now: round2(now), previous: null, delta: null, percent: null };
  }
  const delta = round2(now - previous);
  // A percentage against a zero base is not "infinite%", it is undefined — the
  // narration should say "from nothing", not divide by zero.
  const percent = previous === 0 ? null : Math.round((delta / previous) * 1000) / 10;
  return { now: round2(now), previous: round2(previous), delta, percent };
}

const sum = (lines: EmployeeRunLine[], pick: (l: EmployeeRunLine) => number): number =>
  round2(lines.reduce((total, line) => total + pick(line), 0));

/**
 * The variance of `current` against `previous`, or against nothing when this is
 * the first run (`previous` is null) — in which case every movement reports its
 * value with a null previous, and the narration says so rather than inventing a
 * comparison.
 */
export function computePayrollVariance(
  current: RunSnapshot,
  previous: RunSnapshot | null,
): PayrollVariance {
  const previousIds = new Set((previous?.employees ?? []).map((e) => e.employeeId));
  const currentIds = new Set(current.employees.map((e) => e.employeeId));

  const joiners = current.employees
    .filter((e) => !previousIds.has(e.employeeId))
    .map((e) => ({ name: e.name, netPay: round2(e.netPay) }));

  const leavers = (previous?.employees ?? [])
    .filter((e) => !currentIds.has(e.employeeId))
    .map((e) => ({ name: e.name, netPay: round2(e.netPay) }));

  return {
    currentCode: current.code,
    previousCode: previous?.code ?? null,
    currency: current.currency,
    headcount: {
      now: current.employees.length,
      previous: previous ? previous.employees.length : null,
      joiners,
      leavers,
    },
    totals: {
      gross: movement(current.totalGross, previous?.totalGross ?? null),
      deduction: movement(current.totalDeduction, previous?.totalDeduction ?? null),
      net: movement(current.totalNet, previous?.totalNet ?? null),
      employerCost: movement(current.totalEmployerCost, previous?.totalEmployerCost ?? null),
    },
    drivers: {
      overtimeHours: movement(
        sum(current.employees, (e) => e.overtimeHours),
        previous ? sum(previous.employees, (e) => e.overtimeHours) : null,
      ),
      unpaidLeaveDays: movement(
        sum(current.employees, (e) => e.unpaidLeaveDays),
        previous ? sum(previous.employees, (e) => e.unpaidLeaveDays) : null,
      ),
      employerContribution: movement(
        sum(current.employees, (e) => e.employerContribution),
        previous ? sum(previous.employees, (e) => e.employerContribution) : null,
      ),
    },
  };
}

/**
 * Every monetary and countable figure in a variance, as a set of strings.
 *
 * This is the ground truth the model's narration is checked against: a number
 * the narration states that is not in this set was not given to the model, so
 * the model computed it — which the rules forbid (spec.md: "the model narrates;
 * it never computes"). Names are excluded on purpose; only figures are checked.
 *
 * Each value is offered in the forms a narration might write it: the raw
 * two-decimal number, the integer when it is whole, and the thousands-separated
 * form the UI uses. Percentages are included with and without a sign.
 */
export function groundedAmounts(variance: PayrollVariance): Set<string> {
  const out = new Set<string>();

  const add = (n: number | null): void => {
    if (n === null) return;
    const abs = Math.abs(n);
    for (const value of [n, abs]) {
      out.add(String(value));
      if (Number.isInteger(value)) out.add(value.toLocaleString('en-US'));
      else
        out.add(
          value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        );
    }
  };

  const addMovement = (m: Movement): void => {
    add(m.now);
    add(m.previous);
    add(m.delta);
    add(m.percent);
  };

  add(variance.headcount.now);
  add(variance.headcount.previous);
  for (const p of [...variance.headcount.joiners, ...variance.headcount.leavers]) add(p.netPay);
  addMovement(variance.totals.gross);
  addMovement(variance.totals.deduction);
  addMovement(variance.totals.net);
  addMovement(variance.totals.employerCost);
  addMovement(variance.drivers.overtimeHours);
  addMovement(variance.drivers.unpaidLeaveDays);
  addMovement(variance.drivers.employerContribution);

  return out;
}

/**
 * Numbers a narration states that the variance does not contain.
 *
 * Returns the offending figures, so a test can assert the list is empty for an
 * honest narration and non-empty when the model invents one. Digit groups are
 * read whole (`61,200` is one number, not `61` and `200`); a bare year-like or
 * id-like token is ignored only when it is not otherwise a figure in the set.
 */
export function ungroundedAmounts(narration: string, variance: PayrollVariance): string[] {
  const grounded = groundedAmounts(variance);
  const spoken = narration.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const offending: string[] = [];
  for (const token of spoken) {
    const normalised = token.replace(/,/g, '');
    if (grounded.has(token) || grounded.has(normalised)) continue;
    // A whole number the narration wrote without separators, checked against the
    // separated forms too, and vice versa.
    const asNumber = Number(normalised);
    if (Number.isFinite(asNumber) && grounded.has(String(asNumber))) continue;
    offending.push(token);
  }
  return offending;
}
