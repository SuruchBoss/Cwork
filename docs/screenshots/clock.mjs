// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Puts a browser on the API's clock.
 *
 * Every screenshot shows "today" twice. The API decides what today is — which
 * shift, which punches, which payroll period is open — and the page prints
 * today's date and counts the hours worked up to now. When the two clocks agree
 * nobody notices. They disagree when the API runs on a pinned clock, which is
 * how the screenshots are taken on a working morning instead of whenever the
 * run happens to be:
 *
 *   faketime -f '@2026-09-28 01:50:00' node dist/main.js   # 08:50 in Bangkok
 *
 * (DONT_FAKE_MONOTONIC=1 alongside, or Node's timers stall.) Without this the
 * browser would print Saturday's date above Monday's shift.
 *
 * The API's Date header is its clock to the second, which is all a screenshot
 * can show. Only Date is moved: timers and animation frames run on the real
 * clock, so the page behaves exactly as it would.
 */
export async function followApiClock(context, apiUrl) {
  const res = await fetch(apiUrl);
  const offset = Date.parse(res.headers.get('date')) - Date.now();
  // Within a minute is the same moment as far as any screen can tell.
  if (!Number.isFinite(offset) || Math.abs(offset) < 60_000) return 0;

  await context.addInitScript((shift) => {
    const RealDate = Date;
    function ApiDate(...args) {
      if (!new.target) return new RealDate(RealDate.now() + shift).toString();
      return args.length > 0 ? new RealDate(...args) : new RealDate(RealDate.now() + shift);
    }
    ApiDate.prototype = RealDate.prototype;
    ApiDate.now = () => RealDate.now() + shift;
    ApiDate.parse = RealDate.parse;
    ApiDate.UTC = RealDate.UTC;
    globalThis.Date = ApiDate;
  }, offset);
  return offset;
}
