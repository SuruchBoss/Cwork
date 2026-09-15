# Personal data in Cwork

What an installation holds about the people in it, how long it holds it, and how
to take it out again.

**This is not legal advice.** It describes what the software does, so that
whoever is accountable under the PDPA can decide what to do about it. The
retention periods an employer must satisfy under Thai labour and revenue law are
for that person and their advisor to set; what is written down here is what the
code enforces today, and what it leaves to you.

The employee-facing notice that goes with this is
[`privacy-notice.th.md`](./privacy-notice.th.md).

---

## What is collected

### Identity and employment

| | |
|---|---|
| Names, nickname, date of birth, gender, marital status, nationality | `employees` |
| National ID, passport number, tax ID | `employees`, **encrypted** (AES-256-GCM); only the last four digits of the national ID are stored in the clear, so HR can confirm a number without reading it |
| Personal phone, address, personal email, photo | `employees` |
| Bank account number | `employee_bank_accounts`, **encrypted** |
| Emergency contacts — name, relation, phone, address | `employee_contacts` |
| Dependants — name, relation, date of birth, national ID | `employee_dependents`, ID **encrypted**. Collected only because Thai personal income tax allowances depend on them |
| Education history, including GPA | `employee_education` |

### Work records

| | |
|---|---|
| Clock-in and clock-out times | `attendance_punches`, `attendance_records` |
| **Location at the moment of a punch** — latitude, longitude, accuracy, distance from the worksite | `attendance_punches`. Recorded **only when a punch is taken**, never continuously. There is no background tracking anywhere in the mobile app |
| Device id, model, app version, IP address of a punch | `attendance_punches` |
| Leave, **including sick leave and its reason text**, and any attached certificate | `leave_requests`, `file_objects` |
| Overtime, payslips, salary, allowances, deductions, tax and social security | `overtime_requests`, `payslips`, `employee_compensations` |
| Expense claims and their receipts | `expense_claims` |
| Performance reviews, KPI goals, calibration notes | `performance_reviews`, `kpi_goals` |
| Resignation, clearance checklist, exit interview | `resignations` |

### Accounts and security

| | |
|---|---|
| Email, phone, password hash (Argon2id) | `users` |
| Two-factor secret and recovery codes | `users`, secret **encrypted**, recovery codes hashed |
| Sessions — device, IP address, user agent | `sessions` |
| Push notification tokens | `device_tokens` |
| **Audit trail** — who did what, when, from which address | `audit_logs`. Append-only at the database level |

### Applicants

| | |
|---|---|
| Name, email, phone, current employer, expected salary, CV | `candidates`, `applications`, `file_objects` |
| Assessment answers, interview notes, offers | `assessment_*`, `interviews`, `job_offers` |
| Consent timestamp and its expiry | `candidates.consentAt`, `candidates.consentExpiresAt` |

An application is refused outright without consent — that is enforced in code,
not left to the form.

### The assistant

Off by default. When `ASSISTANT_ENABLED=true`, questions and answers are stored
in `assistant_conversations` and `assistant_messages`. The assistant's tools
take no employee id and resolve the subject from the signed-in user, so a
conversation cannot contain another employee's records — see
[ADR-0004](./adr/0004-assistant-tool-scoping.md).

---

## How long it is kept

**Enforced by the software today:**

| Record | Period | Enforced by |
|---|---|---|
| Applicants who were not hired | **12 months** from consent | `purge-expired-candidates`, runs daily |
| Expired sessions and password-reset tokens | **30 days** past expiry | `prune-expired-tokens`, runs weekly |
| First-run setup tokens | **30 days** past expiry (they stop working after one hour) | the same job |
| Delivered notification events | **14 days** (`OUTBOX_RETENTION_DAYS`) | `purge-delivered-outbox` |

**Not enforced by the software:** everything else — employee records, payslips,
attendance and its location data, leave including sick leave, performance
reviews, the audit trail. They are kept until somebody removes them by hand.

That is a gap, it is tracked as `CW-015`, and it is stated here rather than left
to be discovered. Until it closes, an operator running Cwork for real people
needs a retention period written into their own policy for each class above, and
a diary note to act on it. The procedure below is how to act on it.

---

## Taking data out

### What an employee can be shown

Everything above about themselves is visible in the console or the app, except
the audit trail. For a formal subject-access request, the practical route today
is a read-only database query per table; there is no export button yet.

### Erasure

Two things make this less simple than `DELETE`, and both are deliberate.

**1. Some tables are append-only.** `audit_logs` and `attendance_punches` carry
a database trigger that raises on `UPDATE` and on `DELETE`. It exists so that a
compromised application account cannot rewrite history — and it means the
application itself cannot erase from those two tables either. It also means an
employee who has ever clocked in **cannot be removed with a plain `DELETE`**:
the cascade hits the trigger and the whole statement fails.

**2. Erasure is rarely the right answer for all of it.** An employer has records
it is obliged to keep. The usual correct outcome is to erase the identifying and
location data and keep the employment facts.

**The procedure.** Two people, one of whom has database access; record it
outside the application, because the audit trail cannot record the erasure of
itself.

Step 1 — revoke access and hide the record. From the console: delete the
employee. This soft-deletes them and disables the login immediately.

Step 2 — redact the personal fields. In a transaction, with the trigger
temporarily disabled:

```sql
BEGIN;

ALTER TABLE attendance_punches DISABLE TRIGGER attendance_punches_append_only;

-- Location, device and network identifiers. The punch times stay: they are the
-- working-hours record, and they identify nobody once the rest is gone.
UPDATE attendance_punches
   SET latitude = NULL, longitude = NULL, "accuracyM" = NULL, "distanceM" = NULL,
       "ipAddress" = NULL, "deviceId" = NULL, "deviceModel" = NULL,
       "selfieFileId" = NULL
 WHERE "employeeId" = :employee_id;

ALTER TABLE attendance_punches ENABLE TRIGGER attendance_punches_append_only;

-- Identity. The encrypted columns are cleared rather than left encrypted:
-- FIELD_ENCRYPTION_KEY is one backup away from being available again.
UPDATE employees
   SET "nationalIdEnc" = NULL, "nationalIdLast4" = NULL, "passportNoEnc" = NULL,
       "taxIdEnc" = NULL, "socialSecurityNoEnc" = NULL,
       "personalEmail" = NULL, phone = NULL, "photoFileId" = NULL,
       "dateOfBirth" = NULL, nationality = NULL,
       "addressLine" = NULL, "subDistrict" = NULL, district = NULL,
       province = NULL, "postalCode" = NULL
 WHERE id = :employee_id;

DELETE FROM employee_bank_accounts WHERE "employeeId" = :employee_id;
DELETE FROM employee_contacts      WHERE "employeeId" = :employee_id;
DELETE FROM employee_dependents    WHERE "employeeId" = :employee_id;
DELETE FROM employee_educations    WHERE "employeeId" = :employee_id;
DELETE FROM employee_experiences   WHERE "employeeId" = :employee_id;
DELETE FROM employee_tax_profiles  WHERE "employeeId" = :employee_id;

-- Sick-leave reasons are health data; the leave record itself is a working-time
-- record. Clear the text and the certificate, keep the dates and the balance.
UPDATE leave_requests
   SET reason = NULL, "contactPhone" = NULL, "attachmentIds" = '{}'
 WHERE "employeeId" = :employee_id;

COMMIT;
```

Step 3 — the files. Stored blobs are not reached by the SQL above. Delete the
rows' underlying objects from `STORAGE_LOCAL_PATH` or the S3 bucket.

Step 4 — the backups. A restore brings all of it back. Either re-run this
procedure after any restore, or keep a list of erasure requests to replay. This
is the part most likely to be forgotten.

**What cannot be erased:** `audit_logs`. It records actor ids and IP addresses
and is append-only by design. Dropping that trigger to edit it destroys the
integrity property the trail exists for. Treat the audit trail as a record with
its own retention period, ending in dropping the partition or the table — not in
editing rows.

---

## Where data leaves the installation

Nothing leaves unless it is configured to. By default, all four are off or unset:

| | When | What goes |
|---|---|---|
| SMTP | `EMAIL_ENABLED=true` | Notification subject and body, recipient address |
| Firebase Cloud Messaging | `PUSH_ENABLED=true` | Notification title and body, device token |
| Anthropic | `ASSISTANT_ENABLED=true` | The question, and whatever the tools returned for that user |
| S3 | `STORAGE_DRIVER=s3` | Uploaded files, including CVs and any leave certificates |

`clamd` scanning is local; nothing is sent anywhere for it.

---

## Related

- [Security](./security.md) — encryption, access control, the audit trail
- [Operations](./operations.md) — backups, and what `FIELD_ENCRYPTION_KEY` protects
- [`privacy-notice.th.md`](./privacy-notice.th.md) — the notice for employees
