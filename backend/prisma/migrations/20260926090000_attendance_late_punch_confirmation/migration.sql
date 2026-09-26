-- A manager confirmation for a late-captured offline punch (CW-025).
--
-- A queued punch that reaches the server past the organisation's ceiling
-- (settings.attendance.latePunchCeilingHours, default 12) is recorded and
-- flagged LATE_CAPTURE, then routed through the existing approval engine for a
-- manager to acknowledge or reject. There is no new table: the punch is
-- append-only and the ApprovalInstance keyed on (ATTENDANCE_LATE_PUNCH, punchId)
-- is the confirmation record, so this migration only teaches the enum the new
-- entity type.
--
-- `ALTER TYPE ... ADD VALUE` is not used elsewhere in this migration, which is
-- what lets it run inside migrate's transaction on PostgreSQL 12+.

-- AlterEnum
ALTER TYPE "ApprovalEntityType" ADD VALUE 'ATTENDANCE_LATE_PUNCH';
