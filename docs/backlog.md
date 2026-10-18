# Backlog

Open work on Cwork, most important first. Every ticket here is grounded in
something that is actually missing or broken in the code — not a wish list.

The [specification](./spec.md) says what the system does today. This says what
it does not.

**Who maintains what**

`spec.md` and this file belong to whoever holds the product-owner role: scope,
the order work happens in, and when a ticket is done. `README.md` is shared.
Code, and the technical documentation describing it, belongs to whoever writes
it.

Every ticket here has a GitHub issue carrying the same `CW-` number. The issue
is authoritative for **status** — open, closed, who is on it — and this file is
authoritative for **reasoning**, which is what makes the Done table worth more
than a list of closed issues. Whoever finishes a ticket names the commit in its
issue; the Done entry here gets written from that.

**One exception:** test counts. `npm run verify:docs` fails the build when a
count written in prose stops matching the suites, including the ones in
`spec.md`, so whoever changes the suites updates the counts in the same commit.
Nothing else in these two files is covered by it.

Open a ticket in either place and the other gets one to match. A ticket with no
issue is invisible to anyone browsing the repository; an issue with no entry
here loses its reasoning the moment it is closed.

**Conventions**

| | |
|---|---|
| Priority | **P0** blocks a real deployment · **P1** needed before payroll runs on real people · **P2** worth doing · **P3** nice to have |
| Estimate | **S** under a day · **M** a few days · **L** a week or more |
| 🌱 | Good first issue — self-contained, with a clear acceptance test |

## Order of work

Agreed 2026-09-15 — the reasoning is in
[spec.md § Agreed direction](./spec.md#agreed-direction). Priority still marks
severity; this is the sequence work is actually taken in.

| Phase | | |
|---|---|---|
| **0** | A baseline to measure from | ✅ closed 2026-09-16 |
| **1** | A stranger can install it | ✅ closed 2026-09-16 |
| **2** | The pilot can run | ✅ closed 2026-09-26 |
| **Pilot A** | Records in Cwork by 31 October 2026 | CW-062 on the real NAS · UX alongside: CW-066 |
| **Pilot B** | Shadow payroll for November, beside their Excel | CW-085 |
| **3** | Payroll can file and pay · the app is complete | CW-031 · CW-019 · CW-045 → CW-046 → CW-047 · CW-012 · CW-013 · CW-014 · CW-043 |
| **4** | When someone actually needs it | CW-021 · CW-037 · CW-041 |
| **E** | Ecosystem — runs alongside, does not displace | CW-052 · CW-051 |

**Phase E added 2026-09-25.** Cwork is the system of record for people and
labour cost in an ecosystem with PaynEat POS and PaynEat ERP (the ERP's
ADR-0011). It is a lane rather than a phase because nothing in the ERP's first
release waits on Cwork, and the filings in phase 3 have people waiting on them
every day. CW-050 in particular is sequenced **after CW-044**. The principle
every ticket here is held to — it must make sense for a standalone install — is
in [spec.md § Agreed direction](./spec.md#agreed-direction).

The labour-data contract the ERP will consume is drafted in
[labour-data-contract.md](./labour-data-contract.md) and is design-only.
All of its decisions were settled on 2026-09-25, so **CW-051 implements it**.

**Phase 3 was re-aimed on 2026-09-19.** The original plan put the tax filings
last, reasoning that with no real company there was nobody to file for. That
reasoning expired when the goal became adoption rather than a pilot: payroll
that computes and cannot file or pay is the gap between Cwork and the software
people pay for, and it shuts out the largest group of potential users. CW-004
stays open as the parent of CW-045, CW-046 and CW-047 rather than being worked
as one ticket.

The filings hang off one seam. `CW-044` builds the reconciliation, permission,
download and audit path once; each filing is then a formatter over figures that
have already been checked, rather than five implementations of the same
reconciliation each able to be wrong in its own way. Only the ภ.ง.ด. chain is
sequential — ประกันสังคม, the bank file and all three mobile tickets run
alongside it.

Thirteen tickets closed between 2026-09-16 and 2026-09-19, through 0.3.0.
Phase 2 is down to CW-025 and phase 3 to the demo, document requests on mobile,
and CW-043 — which exists because a decision of mine did not reach the code; see
its ticket.

The plan was drawn up before CW-002, CW-003, CW-006, CW-007 and CW-020 landed,
and those five came out of it as they were finished. CW-005 and CW-023 have
since landed together — they were the same work described twice — which takes
email and push out of phases 2 and 4 both. Consequences worth stating rather
than leaving implicit:

- **Phase 1 lost CW-020, CW-034 and CW-035** — the advisories are cleared, and
  the README now carries screenshots and an English translation.
- **Multiple instances are supported now, not forbidden.** The plan assumed one
  instance scaled vertically; CW-003 and CW-007 made replicas a configuration
  rather than a hazard. Nothing downstream depends on the old assumption.

Phases 0 and 1 closed on 2026-09-16. A landing page and a recorded demo
walkthrough were built alongside them with no tickets of their own, and the
walkthrough covers the recording CW-034 asked for and did not get. Recorded
here so the history is not misleading about where that work came from.

**The pilot got a company and a date on 2026-09-30:** go-live by
31 October 2026 ([spec.md § Before real people use it](./spec.md#before-real-people-use-it)).
It runs Odoo in a container on a NAS and clocks in with a fingerprint scanner
that exports to Excel. The pilot row comes before phase 3 because it has a
date and phase 3 does not. It needs four things:
- the app installed (CW-060);
- Cwork running on that NAS (CW-062);
- the scanner's punches imported (CW-061);
- employees and leave balances brought across (CW-059, whose payroll half can
  follow, since payroll is not in the pilot). The company confirmed on
  2026-10-10 that Odoo holds no HR data, so HR fills CW-059's template from
  paper or their own Excel; there is no Odoo export to map.

**The pilot was re-scoped on 2026-09-30, with the owner's agreement: "back
office first", then a shadow payroll.** The company is about 20 people, mostly
labourers with no smartphones. Its HR copies the fingerprint scanner's times
onto paper, and it pays daily-wage staff every 15 days and monthly staff
monthly, in cash, from Excel. Some of the staff are foreign workers. The
people who use Cwork are therefore HR and the owner, not the staff:

- **Pilot A (by 31 October)** puts the records in. Cwork runs on the NAS in
  the office only. The scanner's file is imported instead of copied onto paper.
  HR records leave for staff who cannot, and foreign workers' documents are
  held.
- **Pilot B (November)** runs payroll alongside their Excel. It pays nobody:
  they keep paying cash as now, and every difference between the two is
  explained. It is the first evidence anyone has that Cwork's Thai payroll is
  right, which #36 has lacked from the start.
- **Dropped from the pilot:**
  - CW-064 and CW-060 (no one at the pilot company uses the app);
  - CW-019 (they pay in cash);
  - CW-031, which is unaffected and waits on the owner as before.

**CW-058, CW-059 and CW-019 moved up on 2026-09-28**, after a look at
PeopleFlow (peopleflowglobal.com), a Thai HR service sold per head. Its first
claim is being "genuinely Thai": Buddhist-era years, a Sunday week, 24-hour
time. It imports employees from Excel and exports the bank transfer file.
Cwork has none of the three. Each is small next to the filings, and each is
something an evaluator notices in the first ten minutes. CW-059 goes before
CW-046 and CW-047 for a second reason: a company that starts mid-year cannot
file a correct annual summary without the months it ran elsewhere.

**`CW-031` moved to the front of phase 3 on 2026-09-26.** A hosted demo is the
largest single thing that would help anyone evaluate this project. It waited only
on who pays for the assistant, and that was settled on 2026-09-25: nobody does,
so the assistant is off. It will be hosted on Render. The landing page's only
button today is a download, which asks an HR manager to install software before
seeing any of it.

---

## P0 — blocks a real deployment


### CW-064 · An employee's first sign-in
`P2` · auth · mobile · **M** · not needed by the pilot

**Re-prioritised 2026-09-30: P0 → P2.** The pilot's staff do not use the app;
HR records for them (CW-067). The decisions below stand for when a company's
staff do.

Found by the dev while building CW-059, on 2026-09-30. **No employee can set
their first password.**
- An account can be created as `INVITED`, but nothing takes it further. There
  is no invitation to accept and no way for HR to set a starting password.
- CW-059's import creates employees without accounts at all.

The pilot's employees file leave in the app, so without this nobody at the
pilot company except HR can use Cwork.

A second gap sits behind it: **sign-in needs an email address**
(`LoginDto.email` is `@IsEmail`). The pilot clocks in on a fingerprint scanner,
and staff like that often have no work email. Cwork must not require one.

**Decided 2026-09-30:**
- **HR hands each employee a one-time activation code** (a code and a QR code)
  from the console. The employee opens the app, enters or scans it, and sets
  their own password. HR never knows it. Email can carry the same code where
  the company has SMTP, but the process must not depend on email.
- **An employee without an email address can have an account** and signs in
  with their employee code. Email stays accepted wherever there is one.

**Scope**
- Create accounts for many employees at once: every imported employee without
  an account, in one action.
- A printable sheet of activation codes, one per employee, for HR to hand out.
- Activation codes are credentials:
  - single use;
  - expire after a set time;
  - stored hashed and shown once;
  - reissuing one voids the last;
  - each issue and use is audited;
  - attempts are rate-limited like sign-in.
- Roles that require a second factor still enrol one at first sign-in, as today.

**Acceptance**
- An imported employee with no email address receives a code from HR, and
  activates and signs in on the app with no help. HR never sees their password.
- A used, expired or reissued code is refused, and so is a guessed one, within
  the sign-in rate limit.
- Signing in with an employee code works, and existing email sign-in is
  unchanged, lockout and second factor included.
- The code sheet prints on A4 with names in Thai.
- Tests cover each refusal. Because this touches authentication, the sign-in
  paths that GHSA-3cgw-73cr-r8c6 hardened get tests showing they did not
  regress.

**Files** `backend/src/modules/auth/`, `backend/src/modules/employees/`,
`backend/prisma/schema/`, `web/src/features/employees/`, `mobile/lib/features/auth/`

---


### CW-062 · Run on the pilot's NAS, beside Odoo
`P0` · platform · docs · **S–M** · pilot, by 31 October 2026 · cloud side done 2026-10-17 (`f15746b`); open for the real NAS (#62)

**Done so far (2026-10-17):** `deploy/nas/` (one compose file with db/app/tools
profiles, Caddy HTTPS on one port with its own authority, and check, install,
backup, restore, update, rollback, bundle and uninstall scripts),
`docs/guide/nas-install.th.md`, the "Running on a NAS" section of
`docs/operations.md`, and the uploads-ownership fix in `backend/Dockerfile`.
Rehearsed on a clean Docker host beside Odoo 17 (`docs/nas-rehearsal-2026-10.md`):
install, update, rollback and a byte-exact restore passed, sign-in with 2FA
survived, and only the HTTPS port was open. Not tried: DSM itself, installing
the authority's certificate on Windows, a scan from outside the office, path C
on a real office PC. **Left:** the acceptance below on the pilot's NAS, which
waits on the owner's approval and starts with the read-only `./check.sh`.
`npm run db:verify` now runs from the tools image (`368c303`, CI job "Tools
image runs db:verify").

The pilot company already runs Odoo in a container on a NAS, and Cwork goes
next to it. `docker-compose.yml` is written for a Linux host. A NAS adds the
questions below, and each one can stop a go-live on the day.

**Needs from the pilot before building:** the NAS make and model, its CPU
(x86 or ARM), its memory and what else it runs, and how the office reaches
the internet.

**The NAS, confirmed 2026-10-17 (owner):** Synology DS925+, AMD Ryzen V1500B
(x86-64, four cores), 20 GB of memory, on the office LAN. Not known yet: the
DSM version, whether Container Manager is installed, and the free space; the
owner is asking someone at the pilot. The installer checks these itself and
says which path applies.

**Three ways to install, asked for by the owner (2026-10-17):**
- **A. Container Manager already installed:** Cwork's compose project runs
  on the NAS.
- **B. Container Manager not installed:** the guide installs it from DSM's
  Package Center first, then follows A.
- **C. The app on an office PC, the data on the NAS:** PostgreSQL runs on the
  NAS (which still needs Container Manager) and the API and console run on a
  PC that connects to it over the network. **Decided by the PO:** C never
  puts PostgreSQL's data directory on a shared folder opened over SMB or NFS
  by a database running elsewhere; that is how database files get corrupted.
  Its cost: the console is down whenever that PC is off, so A or B is the
  recommended path and C the fallback.
- Every path has a rollback, a backup before every update, a short checklist
  someone without IT can follow, and one rehearsal on a clean test machine
  written up here. **Nothing touches the pilot's real NAS until the owner
  approves.** The installer stays free (CW-077, CW-086).

**Scope**
- Cwork's images build and run on that NAS's CPU. ARM is the usual trap.
- Cwork and Odoo run side by side with no port clash and enough memory for
  both.
- **For this pilot, the office network only** (decided 2026-09-30). HR and
  the owner use the console in the office, and nobody uses the app, so
  nothing of the NAS is opened to the internet. HTTPS still applies inside
  the office. How the office browsers come to trust the certificate is the
  dev's to choose and document.
- Reaching Cwork from outside, for a company whose staff do use the app, is
  documented as an option and not set up here. When it is, the certificate
  must be one phones already trust, because the app refuses any other
  (CW-060).
- A nightly database backup to somewhere other than the disk it backs up,
  and `FIELD_ENCRYPTION_KEY` kept apart from it
  ([operations.md](./operations.md)).

**Acceptance**
- Cwork runs on the pilot's NAS alongside Odoo, and Odoo is unaffected.
- HR signs in to the console from an office PC over HTTPS.
- A port scan from outside the office finds nothing of the NAS: not Cwork,
  not Odoo, not the NAS's admin page.
- A restore from last night's backup onto a fresh container brings back that
  day's data.
- `docs/operations.md` gains a NAS section that another company with a NAS
  could follow.

**Files** `docs/operations.md`, `docker-compose.yml`, deployment configuration

---


### CW-060 · Employees have no way to install the app
`P1` · mobile · project · **M** · built; not needed by the pilot

**Re-prioritised 2026-09-30: P0 → P1.** Nobody at the pilot company uses the
app, so it no longer blocks the pilot. It is still built, and it still closes
when an APK installs on a real phone.

**Status 2026-09-30: built, waiting on the owner.** The dev delivered it in
3999b86 and 9df919e, and CI is green. The PO checked it against the acceptance:
- One app for every company. The employee connects it by QR code, typed
  address or `cwork://connect` link, and the app refuses anything but HTTPS.
- The console's **Mobile app** page gives HR the QR code and link, pointing to
  a public install page on the company's own server.
- Both READMEs say plainly that iPhone is not supported yet.
- Tests cover an update keeping the company, the session and the queued
  punches, and switching company while punches are queued is refused.
  `check-apk.sh` refuses an APK a later release could not update.

**Not yet possible: an employee actually installing it.** No release carries
an APK yet: 0.3.1 predates this, so the install page's link has no file behind
it. Two owner steps come first ([mobile-release.md](./mobile-release.md)):
1. Create the release signing key and add its four repository secrets. **If
   the key is ever lost, no later version installs as an update.**
2. Cut 0.4.0. The dev has prepared it on `claude/hris-system-setup-kfl3rq`
   (32c64ca: changelog section, versions, landing). It merges into `main` once
   the secrets exist, since a `## [0.4.0]` section on `main` publishes the
   release.

Then install it on a real Android phone against a real HTTPS server, which is
the pilot's (CW-062). That closes it.

Found by the PO on 2026-09-29, preparing a real pilot. **Clocking in happens
only in the app.** The console lists punches but cannot record one. Yet
nothing in the repository gets the app onto an employee's phone:
- No release build, no signed APK and no store listing.
- The release workflow does not touch `mobile/`.
- `mobile/README.md` covers an emulator and a simulator only.
- The API address is fixed at build time (`--dart-define`), so every company
  would need its own build from a developer.

Phase 2, "the pilot can run", closed on 2026-09-26 with this still open. The
gap is the PO's, and it is recorded here so the history does not suggest
otherwise.

**Direction.** One app for every installation. The server address is entered,
or scanned as a QR code from the console, at first launch, the way self-hosted
products usually do it. That keeps the app store option open and means a
company never waits on a developer. The address must be HTTPS. If the dev
finds a reason one build cannot serve every server, bring it back to the PO.

**Needs the owner.** iPhones install outside the App Store only through
Apple's developer programme, which has a yearly fee, and TestFlight. Android
can install a signed APK directly. Whether to pay for iPhone depends on how
many of the pilot's employees use one.

**Acceptance**
- An employee given only a link or a QR code by HR installs the app on Android,
  connects to their company's server, and clocks in. No developer builds
  anything for that company.
- The same on iPhone, or, if the owner decides against the Apple programme for
  now, the README says plainly that iPhone is not supported yet.
- The console shows HR the QR code or link to hand out.
- An update installs over the previous version without signing the employee
  out or losing a punch queued offline.
- The README's install section covers the app as well as the server.

**Files** `mobile/`, `.github/workflows/release.yml`, `web/src/features/`,
`README.md`, `README.th.md`

---



## P1 — before payroll runs on real people


### CW-098 · English payroll warnings say "Compensation"; the scanner days list still shows a raw error (#119)
`P2` · web · **XS** · raised by the dev room while doing CW-097, and by the QA re-test of CW-096, 2026-10-18

1. The four payroll warnings CW-097 fixed in Thai still say "under Compensation"
   in English, where the employee page's card is "Pay". They name the card as
   the English screen does, and the CW-097 test fails if "Compensation" returns.
2. **#119:** on the scanner days page, a range longer than 93 days shows the
   server's English sentence in the Thai console, because the list's
   `ErrorState` does not go through `describeApiError`. It does, Thai names the
   limit, and a page test fails if the raw sentence comes back.
Not the landing page: its cash-sheet picture and alt text still show the removed
note, and landing wording waits on the owner's own words.

### CW-097 · What CW-096 left: the README's cash-sheet picture, red in the dark theme, "ค่าตอบแทน" in warnings
`P1` · web · docs · **S** · raised by the dev room while doing CW-096, 2026-10-18

1. **The README picture.** `docs/screenshots/28-cash-sheet.png` and its `en/`
   copy still show the red note CW-096 removed, and both alt texts describe
   it. Retake both with `docs/screenshots/capture-office.mjs` after CW-096 is on
   `main`, and drop the red-line sentence from the two alt texts. No other
   README wording changes (the storytelling rewrite waits on the owner).
2. **Red in the dark theme.** Danger buttons and the sidebar's red count are
   white on light red, about 2.8:1. Every one reaches at least 4.5:1 in the dark
   theme, the same way #113 did; the light theme does not change.
3. **"ค่าตอบแทน" in payroll warnings.** The Thai warnings in `messages.th.ts`
   that send HR to the employee page's "ค่าตอบแทน" card name it as the screen
   does, "ค่าจ้าง".

### CW-091 · The sidebar scrolls sideways, and HR cannot see its footer
`P1` · UX · web · **S** · Pilot A, before the install (2-6 Nov)

Found by the owner on the demo (2026-10-18) and measured by the UX room
(UX-01, UX-02 of its 2026-10-18 candidates). In Thai the sign-out button in
`.sidebar__controls` is 6px wider than the sidebar (scrollWidth 253, clientWidth
247), and `.sidebar { overflow-y: auto }` makes the x axis auto as well, so the
whole sidebar scrolls sideways. HR's menu is about 20 rows, 1254px tall on a
768px screen, so the name, theme, language and sign-out sit below the fold.

**Acceptance**
- Thai and English at 1280, 1366 and 1920: `sidebar.scrollWidth ===
  sidebar.clientWidth`; the three footer buttons stay at least 40px tall.
- Overflow only; the redesign is CW-094. **Dropped 2026-10-18:** pinning the
  footer above the fold, because CW-094 (after the install) removes this menu and
  the change would mean retaking the HR guide's screenshots twice.

### CW-092 · Small screen fixes before the pilot
`P1` · UX · web · **S** · Pilot A, before the install

From the UX room's 2026-10-18 candidates (UX-03 to UX-07); frontend only.
- **HR dashboard wording** (UX-03): the third card reads "requests waiting on a
  manager, organisation-wide, not yours", and the empty box "nothing waiting for
  you" (drop "you have cleared everything"), so "0 for you" beside "2 leave
  requests" no longer contradicts itself. Thai and English match.
- **The ✓ in empty states** (UX-04) renders as √ in IBM Plex Sans Thai: add a
  line `check` icon to `components/ui/icons.tsx` and use it on the dashboard,
  approvals, SSO filing and SSO shortfall pages.
- **Dark theme contrast** (UX-05): `--text-subtle` under
  `:root[data-theme='dark']` is #6f7887 (about 3.9:1); use #8a94a2 as the
  system-dark block does.
- **Overdue approvals** (UX-06): an item whose `dueAt` has passed gets an
  orange "overdue N days" badge and is listed first.
- ~~Report a problem gets its own icon~~ (UX-07): dropped, CW-094 moves it to
  the account menu.

### CW-093 · The manager's inbox looked empty right after the demo woke
`P1` · web · demo · **S** · follow-up to CW-031

At 13:5x on 2026-10-18 the owner opened the demo cold, chose the manager in the
demo bar and saw "no items waiting"; at 14:3x the same steps showed dev1's two
items. The data was never lost (the dev room reproduced the old reset and every
count stayed the same), so something showed the wrong list: suspects are an
approvals query or badge not keyed by the signed-in user when the persona
switches, or a demo session opened while a reset was running.

**Acceptance**
- Reproduced first, or what was tried is written here.
- A test: switching HR to manager shows the manager's list straight away.
- The CW-031 entry in CHANGELOG stops calling the inbox emptied.


### CW-077 · Before Cwork is sold: what a paying customer is owed
`P1` · business · docs · **M** · owner decides when; not queued

The owner's income plan of 2026-10-10 makes Cwork the first product to earn.
**Revised 2026-10-11 by the owner:** one person cannot install or look after
customers on site, so after Pilot A (which the owner installs personally)
Cwork is sold the way Odoo or a Windows Server product is: the customer's own
IT installs and runs it, support is online only, and a paid remote
installation is offered — never on-site. A Cwork Cloud hosted by the owner is
not planned: uptime, off-site backups and acting as the PDPA processor are
more than one person can carry. Prices are to be researched from real vendor
pages later; none are set here.

**Decided by the owner (2026-10-11, relayed from the Asuna Bot room):** Cwork
Pro is an annual self-hosted subscription — the licence key unlocks the `ee/`
features for the year (candidates: online filing to the Social Security
Office and the Revenue Department, bank transfer files; the filing files HR
uploads by hand stay free, owner 2026-10-11, CW-048) and includes online support; a
remote installation is offered as a paid extra. Letting it lapse leaves the
free edition fully working. Payroll calculation and the law updates behind it
stay free, and a rule change is released for both editions at the same time.
No prices yet; no hosted service. What Pro must
**not** be sold as is "the yearly law updates": the README's Editions section
promises payroll correctness, including the updates when social security, tax
or labour law changes, in the free edition for good (CW-075 already shipped
there). Pro features that depend on the law — filing formats, for instance —
are kept current as part of Pro; the payroll arithmetic underneath stays free.

**Decided by the owner (2026-10-16, relayed from the Asuna Bot room):** bank
transfer files stay a Pro candidate although the first pilot pays wages in
cash: one customer is one data point, what this kind of customer pays for is
installation and support, and the cash sheet (CW-088) is free. Review after
Pilot B: if it pays in cash too, decide again what leads Pro. Open question:
how Pilot B pays its wages.

**Decided by the owner (2026-10-11, relayed from the Asuna Bot room):** an
installer for a company with no IT (a Windows installer, a VM image, or
whatever cheaper form is chosen later) is in the free edition: installing it
yourself is free, having it installed for you is paid. What is charged is
`ee/`, online support and the remote installation. The installer's updater
and backups never depend on a key. Ticket: CW-086. The same rule holds for
PaynEat.

Against the backlog, these are what the plan does not yet cover. None blocks
Pilot B, which is unpaid; all of them come before the first invoice.

- **A qualified review of the payroll rules** (#36, open since September).
  Every figure is computed by hand by the dev and checked by the PO; nobody
  qualified has reviewed them, as `docs/payroll-thailand.md` says. Charging for
  payroll on that basis is the largest risk in the plan.
- **Remote access and the PDPA.** With no hosting, the owner is not the
  customer's processor by default. A remote installation or a support session
  that can see live employee data (national IDs, salaries, health data) may
  still make the owner one for that session. Needed: a short written term for
  remote sessions (customer present, no copies taken, preferably working on a
  database without real data), and support that asks for logs rather than
  dumps. `privacy.md` and `privacy-notice.th.md` cover the employer's side
  only.
- **Backups are the customer's.** `docs/operations.md` already documents
  backups, upgrading and restoring; the support terms must say plainly that
  the customer's IT runs them and that `FIELD_ENCRYPTION_KEY` is kept apart
  from the backups. CW-062 covers the pilot's NAS.
- **What support means.** Online only: a channel, hours and a response time,
  written down, what is in scope (Cwork itself) and what is not (the
  customer's server, network, Docker host), and who answers when the owner is
  at the day job. CW-087.
- **Updates when the law moves.** Free for everyone (see above). A paying
  customer still needs a stated promise of how soon a rule change is released,
  and that promise is the same for both editions.
- **Installable by the customer's IT.** CW-080. For a company with no IT,
  CW-086 (free, owner 2026-10-11).
- **The licence note.** CW-029 recorded that, with DCO and no CLA, the licence
  "cannot realistically be changed". There are no outside contributors yet, so
  an `ee/` folder under another licence for new code, as PaynEat-ERP did,
  stays open to the owner; it should be decided before the first outside
  contribution, not after.
  **Decided by the owner (2026-10-10, confirmed in writing 2026-10-11):** Cwork
  gets a Pro edition in `ee/` under the Elastic License 2.0. Everything already
  in the repository, and everything outside `ee/` afterwards, stays Apache-2.0
  for good; payroll correctness and the law updates behind it, leave,
  attendance, PDPA tools, export, security and bug fixes, and one company with
  no employee limit stay free. Code outside `ee/` never imports from it; a Pro
  key is checked offline and an expired key never locks data or stops a payroll
  run; `ee/` takes no outside contributions. The README (both languages, new
  Editions section), CONTRIBUTING, `docs/spec.md` and
  `docs/labour-data-contract.md` were updated to match. Not done yet, each its
  own ticket when the first Pro code is due: `ee/LICENSE` copied verbatim from
  the official Elastic License 2.0 text, the SPDX check accepting `Elastic-2.0`
  only under `ee/`, a CI guard against imports from `ee/`, and the offline
  licence key.
- **The README** says plainly that self-hosting is free and what Pro and the
  paid remote installation add — done in the Editions section; prices to be
  added when set.

**Acceptance** Each point above has an owner's decision recorded here, and the
ones that need code or docs are their own tickets.

### CW-080 · A customer's IT installs Cwork without the maintainer
`P1` · operations · docs · **M** · after Pilot A; part of CW-077, not queued

From the owner's revised plan (CW-077): after Pilot A, Cwork is installed by
the customer's own IT, with online support only. Today a real install works —
`docker compose` plus `docs/operations.md` (deploying, first run, backups,
upgrading, restoring) — but it assumes someone who builds from source and
already knows how to put a web service behind HTTPS. Gaps an outside IT
person will hit:

- **Published, versioned images.** `docker compose up --build` builds from the
  repository. A release should be pullable images with a version tag, so an
  install is repeatable and an upgrade is a tag change.
- **HTTPS in front.** No guide covers a reverse proxy and certificates; the
  only mention is `PUBLIC_WEB_URL`. One documented, tested way (for example a
  Caddy service in compose) is enough.
- **What the machine needs.** CPU, memory and disk for a given number of
  employees, supported OS, and that the NAS-style ARM case is or is not
  supported (CW-062 will tell).
- **One installation guide in Thai,** start to finish, written for an IT
  person who has not seen the project: requirements, secrets, first run,
  HTTPS, backups, upgrading, what to send support when something fails.
- **A support-bundle command** that collects version, configuration with
  secrets removed, and recent logs, so online support never needs a database
  dump.

**Acceptance** Someone other than the maintainer, using only the published
guide and images on a clean machine, reaches a working install over HTTPS,
takes a backup, restores it, and upgrades one version — and that run is
written up here.

---

### CW-086 · A company with no IT installs Cwork itself
`P2` · operations · **L** · after CW-080 and Pilots A and B; part of CW-077, not queued

**Decided by the owner (2026-10-16, relayed from the Asuna Bot room):** bank
transfer files stay a Pro candidate although the first pilot pays wages in
cash: one customer is one data point, what this kind of customer pays for is
installation and support, and the cash sheet (CW-088) is free. Review after
Pilot B: if it pays in cash too, decide again what leads Pro. Open question:
how Pilot B pays its wages.

**Decided by the owner (2026-10-11, relayed from the Asuna Bot room):** an
installer for a company with no IT is part of the free edition, in Cwork and
PaynEat alike: installing it yourself is free; having it installed for you is
what is paid (the remote installation, with `ee/` and online support). CW-080
makes Cwork installable by someone else's IT; this ticket is for the office
with nobody to call. Both pilot companies run on a NAS, so neither needs it
yet, and the form is chosen when a real customer of this kind asks.

The installed copy keeps updating and backing up without a licence key. The
Editions section promises that a lapsed subscription leaves the free edition
fully working and that a change in the law reaches both editions at the same
time; for an office with no IT the installer's update button is the only way
those updates arrive, so it can never sit behind a key.

What the compose file runs today, and what makes this large: `postgres`
(`pgvector/pgvector:pg16`), `api`, `migrate`, `web` and `clamav`.

**Scope, decided when a customer asks**
- **The form:** a native Windows installer (PostgreSQL with pgvector and
  ClamAV on Windows), a script over Docker Desktop (needs WSL2 and
  virtualisation switched on, and Docker Desktop's own licence terms for
  companies checked first), a ready-made VM image, or a small machine sold
  ready to run. Compare them on the customer's real hardware and on what can
  go wrong without IT.
- **Code signing:** without a certificate Windows SmartScreen warns on the
  installer, which is what an office with no IT is least able to judge. The
  owner decides, with the yearly cost.

**Acceptance**
- Backups run on their own and go somewhere off the machine (a disk that
  fails takes the payroll with it otherwise), with a restore someone without
  IT can follow.
- One-click update that keeps working with no key or an expired one.
- The machine is kept from sleeping while Cwork serves, and says so when it
  cannot be.
- Other staff and the mobile app reach it over the office network, over HTTPS.
- The guide asks for BitLocker (or the platform's disk encryption) and keeps
  `FIELD_ENCRYPTION_KEY` away from the data and the backups, readable only by
  the service.
- Someone without IT, using only the installer and its Thai guide on a clean
  machine, reaches a working install, takes a backup, restores it and updates
  one version, and that run is written up here.

**Files** packaging and `docs/` (new); `docker-compose.yml` as the reference

---

### CW-087 · What Cwork's support covers, written down
`P1` · business · docs · **S** · before the first invoice; part of CW-077, open (#90). The problem-report form is done (219878b, 2026-10-16); the page and the README link wait on the owner's channel and response time

The "what support means" point of CW-077, as its own ticket, the counterpart
of SuruchBoss/PaynEat#168. One person answers support online, beside a day
job, so its cost has to be held by a written scope rather than by locking
features or the installer away.

**Scope**
- One page, Thai and English: what support covers (Cwork itself: install
  questions, errors, payroll results), what it does not (the customer's
  server, network, Docker host or Windows, data entry, payroll advice), the
  channel, the hours and the response time, and who answers when the owner is
  away.
- How a session works when live data could be seen (CW-077's remote access
  point): the customer present, no copies taken, logs and the support bundle
  (CW-080) asked for instead of database dumps.
- **A "report a problem" form in the console (owner, 2026-10-16).** The
  customer describes what happened; Cwork attaches diagnostics with no
  personal data (version, error codes, the request that failed) and builds a
  text or file the customer copies and sends themselves, by LINE or email.
  Cwork never sends anything off the customer's machine by itself. The form
  can be designed and built now; it does not replace the channel, hours and
  response time, which wait on the owner.
- The liability wording is a draft for a qualified reviewer, not final text.

**Acceptance**
- The page is linked from the installation guide and, once the owner has
  confirmed it in the PO room like any change to the Editions section, from
  the README; the owner has confirmed the channel, hours and response time.
- The liability wording is marked as awaiting review until someone qualified
  has read it.
- The problem report contains no name, ID number, salary or other personal
  data, tested against a seeded employee's records, and nothing in it leaves
  the machine unless the customer copies it.

**Done so far (2026-10-16, 219878b):** Help → "แจ้งปัญหา" at `/support/report`,
open to everyone signed in and tied to no key. The report holds what the
person wrote, then the console version, the screen (as a route), the time,
the browser, the language and the last ten failed requests reduced in one
place, `web/src/lib/failure-log.ts`: path segments other than plain lowercase
words become `:id`, query parameter names without values, the status, the
server's error code and request id; never a request body, a response body or
an error message. Kept in the tab's memory only. Copied or saved as `.txt`;
the page makes no request, has no send button, and its "send to" line reads
"ยังไม่กำหนด" until the owner names a channel. Tested with the first seeded
employee's name, code, email, salary and ID number in the path, query, body
and the server's error, none of which reach the report. Guide:
`docs/guide/report-a-problem.th.md`; what is kept is listed in
`docs/security.md`. Not yet walked through in a real browser.

**Owner, 2026-10-17:** support hours are 18:00–24:00 Thai time for now
(after the day job), a temporary value. The channel and the response time
are not set ("ยังไม่กำหนด"); no response time is written anywhere until the
owner states one.

**Files** `docs/` (new page), `README.md`, `README.th.md`

---


### CW-066 · The pilot's daily tasks, as a first-time user does them
`P1` · UX · web · mobile · **M** · Pilot A and B

**Re-aimed 2026-09-30.** The pilot's users are HR and the owner, at a PC in
the office. The staff do not use Cwork. The tasks that count are now:
1. import the scanner's file (CW-061) and correct a day;
2. record leave for an employee (CW-067);
3. keep a foreign worker's documents (CW-068);
4. run the shadow payroll for a 15-day period and a month (CW-069, CW-070);
5. print the payslips and the receipt sheet (CW-071);
6. download the social security file (CW-048).

The tasks listed below were written for an app-using workforce, and they
apply to the next company that has one. For this pilot, the acceptance's
"someone non-technical" is the pilot's own HR person, doing tasks 1, 2, 4 and
5 unaided before the November shadow run.

CW-063 polishes screens in general. This ticket is narrower and comes first:
the few things people at the pilot company will actually do, done by
someone who has never seen Cwork, in Thai, on a phone. The pilot's staff clock
in on a fingerprint scanner and are not technical. If they cannot finish a
task alone, the pilot measures confusion rather than the product.

**The tasks**
1. **Employee:** open the app for the first time, connect to the company
   (CW-060), activate the account with HR's code (CW-064), file a leave
   request, and see it approved.
2. **Manager:** approve or reject that request on a phone.
3. **HR:**
   - import employees and leave already taken from Excel (CW-059);
   - hand out activation codes (CW-064);
   - import the scanner's file (CW-061);
   - read the result.

**How**
- Screens that exist now (the app's leave flow, the approvals tab, and CW-059's
  two import pages): walk each task in Thai at phone width, then fix the copy,
  order and error messages where a non-technical person would stop. The CW-059
  import pages are the dev's latest work. Agree changes with the dev before
  editing files they are still in.
- Screens not built yet (CW-064's activation flow and code sheet, CW-061's
  import): before the dev builds them, give the dev the Thai wording and a
  layout sketch, as a comment on the ticket. Review them once built.
- Error messages from the imports count as UI. "Row 12, national ID: must be
  13 digits" is fine, and a validator's name is not.

**Acceptance**
- Each task is written down step by step in Thai (a short page in `docs/`
  that HR at the pilot company can also use), with a screenshot per step.
- Before 31 October someone non-technical, not a developer, does tasks 1 and
  2 on a real phone with no help. Where they got stuck, and what changed
  because of it, is recorded in the ticket.
- CW-064 and CW-061 each have Thai wording from this ticket before they are
  built, and a UX review after.

**Status 2026-10-09: the app half is merged** (#75). Leave and approvals in
the app, as a first-time user meets them: one day off is one tap, Thai error
messages from the error code, and a reject that cannot be sent without a reason.
The PO checked that each message names someone who can actually help: leave
that has started, and a missing document, go to HR, since only `leave:manage`
can cancel started leave and, until CW-067, HR could not file leave for anyone. Open:
the import pages from the UX review on #59, and a Thai guide for them merged as
#76, which now points to the Organisation form from CW-072.

**Status 2026-10-18: the HR half is walked.** The four jobs for HR at a PC (scanner
file and one day corrected, leave recorded for an employee, the shadow payroll for
a 15-day period and a month, payslips and the receipt sheet printed), at 1366×768
in Thai, from a seeded company. Where a first-time user stops, and what changed:
the scanner review did not say what a decision had done and hung "days with no
punch" under the count of unregistered numbers; leave recorded as approved
vanished behind the default "pending" filter; a period needed a pay date typed
before it could be created, creating a run left HR on the list to find it, an empty
run said nothing about why, the employees a calculation left out were never
named, and the date field put typed digits in the middle of the old date. Fixed
in the web screens with tests; "1 problems" on the spreadsheet imports now uses
`plural()` too. The guide is `docs/guide/hr-daily-tasks.th.md` with a picture per
step (`docs/guide/capture-hr-tasks.mjs`). Not done: a real HR person doing it
unaided (before 31 October, still open), tasks 3 and 6, the mobile app.
Approving a run needs a second person with the permission, so the guide says so
at that step; whether the pilot has one is for the owner to confirm.

Merged as #103 (`feca645`). The PO checked the guide's "do not press Record
payment and publish payslips" step against `PayrollService.markPaid`: it
notifies employees, closes the period, locks the attendance days and the run
can no longer be cancelled, so the step stands and now says so.

**Files** `mobile/lib/features/leave/`, `mobile/lib/features/approvals/`,
`mobile/lib/features/home/`, `web/src/features/employees/EmployeeImportPage.tsx`,
`web/src/features/leave/LeaveImportPage.tsx`, `docs/`

---

### CW-004 · ภ.ง.ด.1 withholding-tax filing export
`P1` · payroll · **L**

Payroll computes withholding correctly but there is no way to file it. Every
Thai employer must submit ภ.ง.ด.1 monthly and ภ.ง.ด.1ก annually; today that
means re-keying from payslips, which is exactly the error-prone step the system
exists to remove.

**Scope**
- ภ.ง.ด.1 monthly export in the Revenue Department's text layout.
- ภ.ง.ด.1ก annual summary.
- 50 ทวิ withholding certificate per employee (pairs with CW-008).
- Reconcile totals against the runs in the period and refuse to export when they
  disagree.

**Acceptance**
- Export for the seeded demo company matches hand-computed totals.
- A period whose runs do not reconcile produces an error naming the difference,
  not a file.
- Rounding matches the Revenue Department's rules, with tests.

**Files** `backend/src/modules/payroll/`, `docs/payroll-thailand.md`

---






### CW-041 · Draft the manager's half of a review
`P3` · assistant · performance · **M**

A manager writing a review has already recorded the evidence — KPI scores,
weights and check-ins are in the system. Assembling that into prose is the part
they put off.

**This one carries a real risk and it is accepted deliberately:** drafted
reviews tend towards sameness, and a manager who accepts a draft unedited has
outsourced a judgement that is theirs to make. The guardrails below are the
reason it is worth doing anyway, and they are not optional.

**Scope**
- A tool taking a **review id**, not an employee id, and refusing unless the
  caller is that review's `reviewerEmployeeId`. A review binds reviewer to
  subject already, so this does not widen the caller's reach.
- It returns only what the manager themselves recorded: KPI goals, weights,
  scores, their own check-in notes. **No attendance, no leave, no salary** —
  those are not review evidence and hoovering them in is how this feature would
  become something nobody asked for.
- Output is a draft in an editable field, labelled as a draft, never saved
  directly as the review.
- The review cannot be submitted unedited: if the text still matches the draft
  byte for byte, submission is refused with an explanation.
- The final rating is the manager's. The model never proposes a score.

**Acceptance**
- A manager can draft, edit and submit; submitting an unedited draft is refused.
- The tool refuses a review the caller does not own.
- The draft cites only KPI and check-in data, proven by a test that puts
  distinctive attendance and salary values in the fixture and asserts they never
  appear.
- With the assistant disabled, review writing works exactly as it does today.

**Files** `backend/src/modules/assistant/`, `backend/src/modules/performance/`,
`web/src/features/performance/`

---


### CW-043 · A provider an operator can run themselves
`P1` · assistant · **M**

CW-038 was asked to choose between telling the truth about
`ASSISTANT_PROVIDER` and making it true. The decision recorded in this file was
**make it true**, and what shipped was the truth-telling half: the names that
had no implementation are gone, a deployment that reports an assistant must now
have one, and `llm-provider.ts` says plainly that it is a seam rather than a
capability.

That work is right and it is finished. The gap is mine: I changed the decision
in the prose and left the acceptance criteria describing the S, so the criteria
were met exactly as written. The remaining half needs its own ticket and its own
criteria rather than a comment on a closed one.

It also matters more now than it did. CW-039 and CW-040 have shipped, so a team's
attendance and a payroll run's figures now pass through a model. An organisation
that cannot send those to a third party currently cannot use any of it — and
`spec.md` states that self-hosting the model is a requirement, not a convenience.

`llm-provider.ts` points at CW-018 for this. That is the wrong home: CW-018 is
embeddings for knowledge search, which is a different call to a different kind
of model. Chat and embeddings should not share a ticket.

**Scope**
- An `OpenAiCompatibleProvider` implementing `LlmProvider`: base URL, optional
  API key (a local server often needs none), and the tool-calling contract the
  interface already defines.
- `ASSISTANT_PROVIDER` accepts it only once it exists — the rule CW-038 set.
- Documented against at least one local runtime end to end, so the claim is
  demonstrated rather than asserted.

**Acceptance**
- With a local OpenAI-compatible server, the assistant answers a policy question
  and completes a tool call, with no request leaving the host.
- Every guardrail holds identically: no tool takes an employee id, write actions
  still need `confirmed: true`, tool calls are audited.
- Switching provider needs no code change beyond configuration.

**Files** `backend/src/modules/assistant/providers/`,
`backend/src/core/config/`, `docs/ai-assistant.md`

---


### CW-045 · ภ.ง.ด.1 monthly withholding filing
`P1` · payroll · **M** · blocked by CW-044 · parent CW-004

Pick a month, download a file in the Revenue Department's text layout, ready to
submit. Today the figures are right and get re-keyed into whatever files them.

Rounding is where this goes wrong quietly, so it is tested against the
Department's rules rather than left to the language's defaults.

**Acceptance**
- The seeded demo company's export matches hand-computed totals line by line.
- Field widths, ordering and padding match the published specification.
- Rounding has tests at the boundaries.
- A period that does not reconcile produces CW-044's error, not a file.

**Files** `backend/src/modules/payroll/`, `docs/payroll-thailand.md`

---

### CW-046 · ภ.ง.ด.1ก annual withholding summary
`P1` · payroll · **S** · blocked by CW-045 · parent CW-004

The year's monthly filings added up — same aggregation, same rounding,
different layout.

**Acceptance**
- The annual export equals the sum of the twelve monthly exports, asserted by a
  test rather than by inspection.
- An employee who joined or left mid-year appears with the months they were paid.
- A year containing a month that does not reconcile is refused, naming it.
- An employer that began using Cwork mid-year files the whole year: the months
  before it come from the opening balances imported by CW-059, counted as this
  employer's own and not as a previous employer's.

**Files** `backend/src/modules/payroll/`

---

### CW-047 · 50 ทวิ withholding certificates
`P1` · payroll · documents · **M** · blocked by CW-046 · parent CW-004

Every employee's annual withholding certificate as a PDF — what they need to
file their own return, and what the employer is required to issue. The
certificate renderer from CW-008 already handles Thai text, letterhead and a
signature block, so this is a template over it.

**Acceptance**
- Each certificate's figures match that employee's line in the ภ.ง.ด.1ก export.
- Thai text renders with no tofu boxes.
- An employee fetches their own and nobody else's; issuing for others needs the
  document-issuing permission.
- Re-issuing supersedes rather than overwrites, and both are audited.
- For an employer that began using Cwork mid-year, the certificate shows the
  whole year's income and tax, including the opening balances from CW-059.

**Files** `backend/src/modules/documents/`, `backend/src/modules/payroll/`

---

### CW-085 · The สปส.1-10 upload file for e-Services, and the November check
`P1` · payroll · **S** · Pilot B

Left by CW-048, which builds the form's data (part 1 totals, part 2 rows) as
CSV, Excel and a printable PDF. Two things could not be done without the
pilot or the owner:

- **The upload file.** No public Social Security Office document gives the
  e-Services upload layout (field widths, separator, encoding); it is handed
  out behind the e-Services login. The owner is asked for a sample upload
  file, names and ID numbers blanked. With it, add the upload format to
  `GET /payroll/reports/sso-filing` from the same sheet, not a second
  calculation.
- **The November check.** The pilot's November export is compared with the
  file they actually submit; every difference is fixed or explained. Two
  known places to look: "wage actually paid" is the wage social security is
  worked on, overtime left out (question 4 on #36), and a foreign worker is
  recognised by a passport or work-permit number on the record, since Cwork
  stores no nationality.

**2026-10-17: what the redacted sample shows.** The owner sent photos of a
filed สปส.1-10, parts 1 and 2, with names, ID numbers, account numbers and
amounts blacked out. They are kept out of the repository; only the layout is
recorded here. It is the form e-Services prints, not the upload file, so the
upload layout is still unknown and the owner will ask the pilot's HR for it.
Against CW-048's printable PDF:

- Part 1 matches: the same five lines (total wage, employee and employer
  contributions, total, number insured). The official form also has the total
  in Thai words under line 4, the establishment's name, branch, address,
  account number and contribution rate in the header, and an "attached as"
  box where "internet" is ticked.
- Part 2 matches on the five columns. Differences: the name column is headed
  "คำนำหน้านาม-ชื่อ-ชื่อสกุล" (title, first name, surname); the header has
  "แผ่นที่ N ในจำนวน M แผ่น", the account number and a six-digit branch
  number (`000000` for the head office); and there is a "รวม" (total) row
  under the wage and contribution columns.
- Both parts are filed online: part 1 says part 2 is made through e-Services.

Free, as decided for CW-048: the file HR uploads by hand is the company's own
data; filing online is the Pro candidate in CW-077.

**Acceptance**
- The upload file opens in SSO e-Services without errors for the pilot's
  November month, or the owner confirms it against the sample.
- The pilot's November export matches the file they submit, or every
  difference is explained.

**Files** `backend/src/modules/payroll/sso-filing.service.ts`

---

### CW-052 · Say where Cwork sits in the ecosystem
`P3` · docs · **S** · 🌱 · phase E

The README describes a product with no neighbours. Add an Ecosystem section
linking PaynEat POS and PaynEat ERP and naming SherWhyve **without a link** — it
is private. Say plainly that none of it is a dependency and that installing
Cwork alone gives the whole product.

*(Already written into `README.md` alongside ADR-0006; this ticket covers the
Thai README and anything the pass missed.)*

**Acceptance** `README.th.md` carries the same section, and no document implies
Cwork needs another system to be useful.

**Files** `README.md`, `README.th.md`

---

### CW-051 · Publish labour aggregates to the ecosystem
`P3` · payroll · attendance · **L** · phase E

Implements [labour-data-contract.md](./labour-data-contract.md), whose every
decision was settled on 2026-09-25. Read it first; this ticket does not restate
it.

**Nothing is waiting on this.** The consuming ERP feature is Enterprise-edition
work scheduled after ERP v1. It is written now because the decisions are fresh,
not because there is a date.

**Scope**
- A `costCentre → locationCode` mapping, maintained in Cwork, many-to-one.
- `labour.cost.period_closed`, emitted when a payroll run closes; and
  `labour.hours.day_locked`, emitted when attendance for a day is locked.
- Suppression at `LABOUR_MIN_GROUP` (5), merging into `UNALLOCATED`, pulling the
  next-smallest group in when that bucket would come from fewer than two.
- Revisions: `revision`, `previousRevision`, and **the revision inside the
  idempotency key** — without it a restatement is discarded as a duplicate by
  the mechanism meant to make delivery safe.
- Emission through the existing outbox (CW-006), to a consumer holding a
  scoped, revocable machine credential whose every call is audited.
- A replay endpoint by period, not a cursor: these aggregates are recomputed
  from stored payroll and attendance, so replay is idempotent and cheap.
- Versioned `labour-data/1.0`, independently of Cwork's 0.x.

**Acceptance**
- **No employee identity and no individual pay appears in any emission** — a
  test puts distinctive names, ids and salaries in the fixture and asserts none
  of them reaches an event.
- A cost centre of four people is suppressed, and the totals still reconcile:
  published plus `UNALLOCATED` equals the period.
- `UNALLOCATED` never represents a single group.
- Re-closing a period emits revision 2 carrying full figures, and a consumer
  that never saw revision 1 can still use it as an opening position.
- An unmapped cost centre is emitted with `locationCode: null`, not dropped.
- Replaying a period twice changes nothing on the consumer's side.

**Files** `backend/src/modules/payroll/`, `backend/src/modules/attendance/`,
`backend/src/core/outbox/`, `backend/src/modules/organization/`

---


## P2 — worth doing


### CW-094 · A top-menu console in earth tones (direction B)
`P2` · UX · web · **L** · after the Pilot A install

**Confirmed by the owner in the PO room, 2026-10-18 15:00:** "ยืนยัน CW-094 ทาง B
สี earth tone ทำหลังติดตั้ง Pilot A". Main colour: olive #5b6b34. The owner left
the choice to the Asuna Bot room (15:02, "ส่วนสี ชั้นให้เธอเลือก"), which picked
olive because terracotta and ochre clash with the red and yellow status colours
and clay disappears into the background; the UX room agreed. With olive, the
success status is a blue-green soft badge with a check icon, never a solid fill
(#24574a on #dcebe4, dark #7fc0a8 on #1e3a31), solid olive is kept for the
primary button only; links are dark olive #46532a (dark #c4d08f); rust #8a3c1e is
kept for overdue and warnings; accent wash #e7ead8 (dark #33381f). Prototype (the owner shares
it first): claude.ai artifact P9XkPvTu1qroAoE2URig92. Direction A (document-like
left menu) was the UX room's first recommendation and is not taken.

Earth-tone palette from the UX room, every text pair at 4.5:1 or better:
background #f3eee5, card #fffcf6, rule #e3dacb, text #2b2620, secondary text
#6b6052, top bar #2f2a23 with menu text #cdbfa9; main colour one of terracotta
#a24a28, olive #5b6b34, clay #8a5a3c, ochre #7d6420; overdue badge #8a3c1e on
#f6dfcf; good status #4f5d2c.

Dark theme (UX room, 2026-10-18, all text pairs 4.5:1 or better): background
#1c1915, card #25211c, raised #2e2923, rule #3a342c, strong rule #4d453a, text
#efe7da, secondary #b8ab97, faint #a89a85, top bar #141210 with menu text
#b8ab97; main colour lightened (terracotta #d9825c, olive #a3b36e, clay
#c99773, ochre #d1b05a) with dark text #1c1915 on it, so `--on-accent` has a
light and a dark value; accent wash #3a2a20; overdue #f0a985 on #3d2619; good
status #a9bd7a. Every value goes in both `@media (prefers-color-scheme: dark)`
and `[data-theme='dark']` (the UX-05 bug was the two drifting apart).

APIs (UX room read the backend on main): UX-23's organisation-wide pending list
does not exist; `GET /approvals/tasks` returns only the caller's tasks and
`GET /leave/requests` has no approver or due date. `ApprovalTask` already holds
approver, `dueAt` and the snapshot, so a new endpoint (proposed `GET
/approvals/pending`, permission for the dev to decide) is needed. UX-24's balance
after approval exists: `GET /leave/balances/:employeeId` returns `available`
with pending days already taken off; one call per employee, or add it to the
`listMyTasks` payload.

- **UX-20** earth-tone tokens in `theme.css`, light and dark; no colour defined
  only in the dark block; every text pair at 4.5:1.
- **UX-21** top menu replaces the left one: groups from `NAV` in
  `navigation.ts`, a single-item group is a direct link, others open a dropdown
  with a one-line description per item; a sub-row for the open group; the
  approvals count on the overview group; one account button for theme, language,
  report a problem and sign-out; Ctrl K searches menu names first (employee
  search only if an API exists). Paths and menu names unchanged. Keyboard: Tab
  reaches the dropdowns, Esc closes, `aria-expanded` right; no wrapping at 1280
  and 1366.
- **UX-22** below 960px and on phones: logo, search and a "menu" button opening
  a full-screen list with collapsible groups (the current page's open); rows at
  least 44px; no sideways scroll at 390px. Replaces the left drawer.
- **UX-23** HR dashboard: cards renamed ("waiting for you", "waiting on a
  manager"), a company-wide table of pending requests with who they wait on and
  when they are due, overdue first, plus "this week" and shortcuts. Needs an API
  listing pending requests organisation-wide with their approver; dev estimates
  first.
- **UX-24** approvals as rows with type filters, an outlined reject button, the
  leave balance after approval (check the API) and the overdue badge from CW-092.
- **UX-25** guides and screenshots: all 14 images of `hr-daily-tasks.th.md`,
  the 14 of `import-from-excel.th.md`, the 28 + 28 README screenshots (84 in
  all) retaken with the capture scripts on a fresh `db:seed`; menu wording fixed
  in 10 guide pages (`report-a-problem` now under the account menu,
  `scanner-import`, `account-roles`, `cash-advances`, `expiring-documents`,
  `period-check`, `sso-filing`, `sso-shortfall` and the two with images). The
  Flutter app is not affected.

Before the install only the overflow fix of CW-091 (#109) and CW-092 go in; the
footer half of CW-091 and CW-092's menu-icon item are dropped because B removes
that menu, and they would mean retaking the guide's screenshots twice.

---

### CW-012 · Expense claims on mobile
`P2` · mobile · **M**

The backend supports expense claims and the console can manage them, but the
employee app cannot submit one — so the person holding the receipt has to wait
until they are at a desk. Photographing a receipt is the obvious phone task.

**Scope** Submit a claim with line items; attach photos from camera or gallery;
track status; see what was reimbursed in which payslip.

**Acceptance** A claim submitted on the phone appears in the console approval
queue with its attachments intact.

**Files** `mobile/lib/features/` (new `expenses/`)

---

### CW-013 · Overtime requests on mobile
`P2` · mobile · **S** · 🌱

Same gap as CW-012: overtime is requested where the work happens, not at a desk.
The approvals tab already exists, so this is the submission half.

**Acceptance** An OT request submitted on mobile is picked up by the same
approval policy as one submitted in the console, with the same multiplier.

**Files** `mobile/lib/features/attendance/`

---

### CW-014 · Document requests on mobile
`P2` · mobile · **S** · 🌱

The assistant can file a document request, but there is no screen for it — so
the feature only exists for deployments that turned the AI on. It should not
take an LLM to ask for a salary certificate.

**Acceptance** Every `DocumentRequestType` can be requested and tracked from the
app with the assistant disabled.

**Files** `mobile/lib/features/` (new `documents/`)

---



### CW-037 · Register the employee app for push
`P2` · mobile · **M**

The backend sends push through FCM and `POST /notifications/devices` has always
existed, but the Flutter app never calls it. So push delivery works and has
nowhere to go: no device has a token registered, and every send finds an empty
list.

**Scope**
- `firebase_core` and `firebase_messaging`, with the Android and iOS project
  configuration each needs.
- Ask for permission at a moment that makes sense — after the first approval
  the person submits, not on the splash screen.
- Register the token after sign-in and refresh it when FCM rotates it;
  unregister on sign-out, or the next person to use the phone gets somebody
  else's leave approvals.
- Open the screen the notification points at when it is tapped: the payload
  already carries `type` and `notificationId`.

**Acceptance**
- A leave approval arrives on a real device within a minute of the decision.
- Signing out stops the notifications for that account on that device.
- A revoked or expired token is removed rather than retried — the backend
  already deletes what FCM reports as `UNREGISTERED`, so this is about not
  re-registering a stale one.

**Files** `mobile/lib/core/`, `mobile/lib/features/auth/`, `mobile/android/`,
`mobile/ios/`

---

### CW-021 · Two-factor enrolment on mobile
`P2` · mobile · **M**

The app can complete a second factor — it shows a code field and accepts a
generated or recovery code — but it cannot *enrol* one. Scanning a QR code with
the phone that is displaying it does not work, so an account required to have a
second factor is currently told to enrol in the web console first.

That is fine while the requirement only reaches privileged console roles. An
organisation that turns on `settings.security.requireMfa` for everyone leaves
its field staff unable to set themselves up from the only device they have.

**Scope** Enrolment without a camera round-trip: show the secret, offer a
"copy to clipboard" and a deep link that hands the `otpauth://` URI straight to
an authenticator app on the same device, then confirm with a code.

**Acceptance** An employee with no console access can enrol and sign in using
only the phone, and the recovery codes are shown once with a way to save them.

**Files** `mobile/lib/features/auth/`

---



### CW-031 · A public demo instance, on Render
`P2` · project · **M** · first in phase 3

**2026-10-01: a real visitor hit the dead link.** The pilot company's owner
pressed "ลองใช้ทันที" and got Render's "Not Found": the service has still not
been created, so every visitor who takes the landing page's main button gets
the same. Either the owner deploys it (docs/demo.md, three steps), or the
button goes back to GitHub until they do. The PO asked for the first and keeps
the second ready.

**Status 2026-09-27: built, waiting on the owner's deploy.** fdf2385 delivers
the scope, and the e2e suite covers the refusals and every lock-out route. The
runbook is [demo.md](./demo.md), and it answers the Render questions below.
Two acceptance items can only be checked on the live service: the one-minute
approval from a sleeping instance, and the reset happening on schedule. **The
landing page and both READMEs already link to `cwork-demo.onrender.com`.** Until
the service exists, the landing page's first button leads nowhere. Service names
on `onrender.com` are global, so deploying soon also keeps someone else from
taking the name the links point at.

Evaluating Cwork means cloning it, writing an `.env`, running compose, migrating
and seeding. The README's screenshots help, but nobody can try an approval flow
from a picture. The landing page's only button is a download, and the people it
is written for (HR managers and owners) cannot act on that on their own.

**Decided 2026-09-25: no budget for the demo's LLM usage, so the assistant is
off in the demo.** Asking visitors for their own API key was never an option.
It trains people to paste credentials into unfamiliar sites, and would make this
project the holder of other people's keys. The recorded walkthrough, already
shipped in Thai and English, is what shows the assistant.

**Decided 2026-09-26: hosted on Render, and first in phase 3.** The owner
creates the Render account and services; everything else is in the repository,
so the demo can be rebuilt from the repository alone and nobody has to remember
how it was set up.

**Scope**
- A hosted instance, writable, so an approval flow can be tried end to end.
- Sign-in as employee, manager or HR in one click. Nobody types a password or a
  two-factor code, and no working password appears on the page, in the
  repository or in the landing page. The demo accounts' password is generated
  at deploy time and never shown.
- **Demo mode cannot be turned on by one mistaken variable.** Whatever enables
  the one-click sign-in and the reset must refuse to run on a database holding
  an organisation the demo seed did not create. It should refuse rather than
  wipe, and refuse rather than open. The seed's `assertDemoDatabase` is the
  precedent.
- The data resets to the seed at least hourly. A banner says when the next reset
  is, and a visitor who arrives mid-reset sees a message rather than an error.
- Nothing a visitor does can lock the next visitor out before the reset. The
  obvious routes are changing a demo account's password or 2FA, deactivating
  it, revoking its sessions, changing its role, and tripping the lockout.
- Off in the demo: the assistant (CW-027 already hides it), email and push, and
  file uploads. Uploads are unscanned without ClamAV, and a public demo would
  serve whatever anybody uploads to the next visitor.
- The demo links to the recorded walkthrough, for the assistant.
- **Landing page (`landing/`, both languages):** the main button becomes
  "ลองใช้ทันที" / "Try it now", which opens the demo for HR. Download moves to a
  second path, "ติดตั้งเอง" / "Install it yourself", which points IT at GitHub
  and `#install`.
- A runbook in `docs/` covering how the demo is deployed, where its secrets
  live, and what to do when something on Render expires.

**To check against Render before building.** render.com could not be reached
from the PO session, so these are assumptions, not facts. Each one changes the
design if it holds:

| Assumption about the free tier | If true, the ticket needs |
|---|---|
| Web services sleep when idle, and the first request waits about a minute | The one-minute acceptance below is measured from a sleeping instance, or the landing page wakes it. Pinging it to keep it awake is not an answer; see the hours row. |
| Free instance hours per month are capped | Two services that sleep fit; two kept awake may not. |
| Free Postgres expires after about a month, one per account | Replacing it is a runbook step that needs no code change. Only `DATABASE_URL` changes. |
| Cron jobs are not free | The reset cannot be a Render cron job. It also cannot be an endpoint anyone on the internet can call. |
| Free services cannot receive private-network traffic, and pre-deploy commands are paid | `web/nginx.conf` proxies to a fixed `api:3000`, and the runtime image ships no Prisma CLI, so it cannot migrate or seed by itself. |
| Render Postgres offers `pgvector` | The init migration runs `CREATE EXTENSION "vector"` unconditionally. |
| A free instance has about 512 MB of memory | The seed boots the whole application to create history (`db:demo`), and has only ever run on a developer machine. |

Record what was found in the runbook. If the free tier cannot meet the
acceptance, say which part and what it would cost, and bring it back to the PO
rather than trimming the acceptance.

**Acceptance**
- Someone with no local setup can approve a leave request within a minute of
  opening the link.
- Each of the three roles signs in with one click, and no working password
  exists anywhere a visitor can read.
- Pointing the demo configuration at a database that holds a real organisation
  makes it refuse to start, with a message. Nothing is wiped. A test proves it.
- After any sequence of actions available in the console, all three one-click
  sign-ins still work. A test covers each route listed in the scope.
- The data returns to the seed on schedule without anyone doing anything.
- The landing page's first button opens the demo, in both languages.
- The demo can be rebuilt from the repository and the runbook, by someone who
  has not seen it before.

**Files** `landing/`, `docs/`, `README.md`, `web/`, `backend/`, deployment
configuration

---



### CW-054 · Measure the counts the gate only declares
`P2` · platform · **S** · 🌱

`npm run verify:docs` exists, in its own words, because *"counts in prose are
the one claim nothing else checks."* It measures two of the five: domain tests
and backend unit tests are counted by running the suites. **The web, mobile and
e2e counts are typed into the script by hand**, and the gate checks the prose
against the typed number — never against the suites.

So it drifts exactly as it was written to prevent. The declared e2e count stood
at 211 while main ran 224; thirteen checks landed across three tickets and CI
stayed green throughout. It surfaced only because a security fix added three
more and someone counted by hand.

**Scope** Measure e2e the way the unit suites are measured — or have the e2e job
assert its own total against the declared figure, and the same for web and
mobile in their jobs. Either way, no count in the gate is a number someone has
to remember to change.

**Acceptance** Adding an e2e test without touching the declared count fails CI,
and so does the same for web and mobile.

**Files** `backend/scripts/verify-doc-counts.ts`, `.github/workflows/ci.yml`

---

## P3 — nice to have


### CW-063 · UX follow-ups from the 30 September pass
`P3` · web · mobile · **M** · after the pilot items

**Status 2026-09-30:**
- **Item 2 is done** (PR #65). It needs one more retake now that CW-058 has
  landed (a1dd8bf): the screenshots still show Gregorian years.
- **Item 3 is done:** leave and approvals in PR #65, and the employee
  directory in PR #66.
- **Item 1 is still open.** Chromium at phone size shows the light theme right,
  but a real device and the dark theme are still unchecked.
- **Fixed along the way:** approvals showed `ANNUAL` instead of the leave
  type's name, in both clients. The issue's checklist is authoritative.

PR #63 was a presentation-only pass over the console and the app, made for HR
staff and employees who are not technical. It shipped without a ticket, so it
is recorded here. The pass:
- replaced raw codes (`CLOSED`, `HR_ADMIN`) with words;
- replaced menu icons that did not render on some machines;
- made touch targets 44px;
- gave status colours a meaning in the app.

Its handoff (`docs/handoff-uxui.th.md`) lists what should come next. This
ticket is that list, and the backlog is where it is tracked:

1. **Look at the app on a real phone, in light and dark themes.** The new
   status and clock-out colours have only been checked by tests, because the
   demo refuses password sign-in. Do it when CW-060's first APK is installed.
2. Retake the README and landing screenshots, which still show the old codes.
3. Show tables as cards below 640px, starting with the three the pilot will
   use most: employees, leave and approvals.
4. An empty state on the performance page that says what to do next.
5. In the roster, tint days off and highlight today's column.
6. Whole table rows that open their record, and still work by keyboard and
   screen reader.
7. On the payroll page, drop the system term "รอบคำนวณ" and show periods as
   months. Do it through CW-058's formatter, not a new one. *(2026-10-10:
   periods now show as months through `formatPeriod`; the words "รอบคำนวณ"
   and "สร้างรอบคำนวณ" are still in `messages.th.ts`.)*
8. Hide the benefit plan code under the plan's details.

**Acceptance** Item 1 is done before the pilot goes live. The rest are done
in any order, each with before and after screenshots in Thai at phone width.

**Files** `web/src/`, `mobile/lib/`, `docs/screenshots/`

---


### CW-056 · The Thai film's last scene turns the console English
`P3` · project · **S**

Found by the PO on 2026-09-27 while checking CW-055. The Thai take of the
product film (`landing/assets/film.th.mp4`) ends in chapter 06 on the
performance page with the caption "และ**ธีมมืด**สำหรับกะดึก". Before the theme
changes, the console switches to English: "Cycle status", "KPI goals", "Score
weighting". The dark theme is then shown in English too. The caption says
nothing about language. A Thai viewer sees their language drop out in the
film's last shot.

The English take does this on purpose, with its own caption ("The whole system
in Thai — one click"). The Thai take looks like the same click, carried over.

**Acceptance** The Thai take's last scene keeps the console in Thai while it
shows the dark theme, or its caption says it switches language, whichever the
film means. Re-recorded from `docs/film/`, not edited by hand, and the English
take is unchanged.

**Files** `docs/film/`, `landing/assets/film.th.*`

---


### CW-018 · Semantic knowledge search
`P3` · assistant · **M**

Retrieval is full-text plus trigram, which handles Thai well and needs no
embeddings — deliberately. pgvector is installed but unused. Paraphrased
questions ("can I get money for my kid's school fees?" against a document titled
"สวัสดิการการศึกษาบุตร") are where lexical search gives up.

**Scope** Optional embedding pipeline behind the existing provider interface;
hybrid ranking with the lexical score; keep lexical as the default so the
assistant still works with no external API.

**Acceptance** With embeddings off, behaviour is unchanged. With them on,
paraphrased queries retrieve the right document, measured against a fixture set.

**Files** `backend/src/modules/assistant/`

---

### CW-019 · Bank payment file export
`P1` · payroll · **M** · blocked by CW-044

A `PAID` run records that people were paid; the transfer itself is manual.
Thai banks each take their own fixed-width or CSV format.

**Scope** A pluggable formatter with one or two common bank layouts; decrypt
account numbers only at export time, under `employee:read:sensitive`; audit every
export.

**Acceptance** A generated file validates against the bank's published spec, and
the export is refused for a run that is not `APPROVED`.

**Files** `backend/src/modules/payroll/`

---

## Done

Kept so the reasoning survives.

| | |
|---|---|
| **CW-000** · Docker quick start could not migrate or seed | The API image is pruned to production dependencies, so `docker compose exec api npx prisma migrate deploy` and `npm run db:seed` — both documented in the README — failed: no Prisma CLI, no ts-node. Fixed by splitting the prune into its own Dockerfile stage and adding a profiled `migrate` service built from the `build` stage. The runtime image is unchanged. |
| **CW-011** · `npm run test:e2e` was a dangling script | It pointed at `./test/jest-e2e.json`, which did not exist, and `backend/test/` was an empty directory, so the command failed with a Jest config error. Rebuilt as a suite that boots the real application, migrates, truncates and seeds its own database, and runs in CI — 36 checks at the time, 49 once CW-001 added its own. Covers auth and deny-by-default, RBAC row scoping at all three visibility levels, the leave ledger, idempotent punch replay, geofence flagging, the payroll lifecycle with separation of duties, and the append-only audit trail. |
| **CW-001** · Privileged accounts could sign in with a password alone | TOTP (RFC 6238), implemented against the RFC's own test vectors rather than pulled in as a dependency, and required — not offered — for any account holding `employee:read:sensitive`, `payroll:run`, `payroll:approve` or `role:manage`. A correct password for such an account now yields a challenge token, not a session; that token carries a `typ` claim the access-token strategy rejects, which is the only thing separating it from a full session since both are signed with the same secret. Codes cannot be replayed inside their own window, recovery codes are single-use, a wrong code counts towards the password lockout, and disabling is refused for an account that must have one. Recovery codes are stored as SHA-256 digests rather than argon2 as the ticket originally said: at 100 bits of entropy a slow KDF buys nothing and only gives a half-authenticated endpoint a way to burn CPU, and refresh tokens already use the same treatment for the same reason. Mobile can present a code but not yet enrol — see CW-021. **Superseded in part by GHSA-3cgw-73cr-r8c6 (0.3.1).** The claim above held for `POST /auth/login` and not for the flow as a whole: `POST /auth/mfa/complete-enrolment` exchanged a challenge token for a session on any account already enrolled, with no code, and a correct password reset the lockout counter the second factor depended on. Both shipped in three releases. |
| **CW-002** · Uploads were never scanned | `FileObject.scanStatus` existed and nothing ever set it, on a system that takes résumés from a public careers page. Uploads now stream to clamd *before* anything is written to storage, so malware is never stored for a later change to expose. The clamd INSTREAM protocol is implemented directly against its specification rather than pulled in as a dependency, and unit-tested. The rule throughout is that a scanner which is not working is never a pass: unreachable, timed out, or a reply that cannot be parsed all land the file at `PENDING`, which is refused on download and retried hourly. A detection is refused at upload with the signature named, audited and notified; quarantine destroys the bytes and keeps the record. Off by default, with a `clamav` compose profile to turn it on, and the API states which mode it is in at every boot. |
| **CW-003** · Rate limiting was per-instance | `@nestjs/throttler` keeps counters in memory, so two replicas behind a load balancer handed out twice the budget and a restart forgot every counter. `THROTTLE_STORAGE=postgres` now shares them through the database that is already there — no Redis, nothing extra to run or back up — as one `INSERT … ON CONFLICT DO UPDATE` so two instances racing on a key cannot both decide they were first. In-memory stays the default for a single instance, and the API says which store it is using at boot. If the store is unreachable the limiter fails open and logs an error: a rate limiter is not worth locking everyone out of a healthy system for. **The ticket’s premise was wrong** and the fix is worth recording: it said the in-memory throttler made "the sign-in lockout per-instance". It never did. The account lockout lives in `users.failedLoginCount` / `users.lockedUntil` and has always been shared. What was per-instance is the per-client *request budget* — which is what catches the caller no single lockout would notice, one wrong password each against a hundred accounts. The e2e suite proves both halves by booting two applications against one database. |
| **CW-007** · Every replica ran every scheduled job | CW-003 made more than one instance a supported configuration and left the cron schedule running on all of them. Each task now takes a **transaction-scoped Postgres advisory lock** before it does anything and the instances that do not get it stand down — no table, no migration, no lease, nothing to switch on, and nothing to clean up: an instance killed mid-job loses its connection and Postgres releases the lock by itself. Lock ids are written out by hand in `domain/job-locks.ts` rather than hashed from the job name, because a hash is one collision away from two unrelated jobs blocking each other for ever and a literal is what you can look for in `pg_locks`. **Two things in the ticket were wrong.** It said a double run would grant leave quota twice: it would not — `rolloverYear` *assigns* the carried balance rather than adding to it, separations are filtered by status, and the purges are `deleteMany`, so every task was already idempotent. What a double run actually costs is the work itself, the duplicated audit and notification rows, and write-write races between instances doing identical work at the same instant. It also asked for a heartbeat "so a crashed holder does not block the next run" — a transaction-scoped lock has nothing to heartbeat, and that is precisely the argument for it over a lease table. The cost, stated in [operations.md](./operations.md): the job runs with a transaction open, so `JOB_LOCK_TIMEOUT_MS` bounds it at fifteen minutes by default and an open transaction holds back vacuum meanwhile. The e2e suite boots three complete applications against one database and never relies on timing to decide the winner — where a race would be the point, the test takes the lock itself and holds it. |
| **CW-006** · The outbox table had no producer and no consumer | The ticket said `outbox_events` "is written transactionally and nothing reads it". Half right: nothing read it, and **nothing wrote it either** — the table had been in the schema since the first migration with no reference to it anywhere in `src`, so the work was both halves rather than one. `OutboxService.record` takes the caller's transaction client and will not work without one, because an event written on the ordinary client is a plain dual write with extra steps and nothing at the call site would show the difference. `OutboxDispatcher` claims a batch with `SELECT … FOR UPDATE SKIP LOCKED`, dispatches to whoever registered for the type, backs off from 30 seconds doubling to a 30-minute cap, and parks an event as a dead letter after `OUTBOX_MAX_ATTEMPTS`. Dead letters are never purged — only delivered events are — because that row is the only record that somebody was owed a message and did not get it. Unlike the scheduled tasks of CW-007, **every instance polls**: `SKIP LOCKED` means each dispatcher takes rows nobody else holds, so three replicas drain three times faster rather than fighting. Delivery is at least once and says so. The producer shipped with it is notifications: the in-app row and the event that will carry it out by email or push are written in one transaction, so no message is ever sent for a notification that does not exist. Nobody is listening yet — an event with no handler is marked delivered rather than queued for ever, and the API warns at boot when no handlers are registered at all — which is exactly the seam CW-005 plugs into. Closed straight afterwards, in the same branch: every call site now passes its own transaction client, so the change and the message about it commit together. `notifyIn`/`notifyManyIn` take the caller's `tx` and throw rather than swallow — inside a transaction there is nothing else they could do, since PostgreSQL has already aborted and catching would only move the failure to the commit. Four of the call sites had no transaction to join and now have one: approving a resignation writes the request, the employee and the employment event together, which was three separate writes that could always have disagreed with each other. The best-effort `notify` survives for exactly one caller — an upload the scanner refused, where nothing was stored and there is nothing to be atomic with — and a unit test fails if a second one appears without being added to the list with a reason. |
| **CW-005** · Notifications never left the database | In-app rows and nothing else, so nobody learned a leave request was waiting unless they opened the console. SMTP is now written out against RFC 5321 and FCM's HTTP v1 API against its own two requests — the same trade as the clamd client and the TOTP implementation, because what is actually needed is one well-specified conversation and the alternative is a transport abstraction and a dependency tree. Both register as outbox handlers, so a failed send retries on the backoff CW-006 already built and never blocks the request that caused it. **The retry rule is the part worth arguing about**: the ticket asked for a bounce to be "retried with backoff and then recorded as failed", but eight attempts over an hour at a mailbox refused for not existing teaches nothing and buries the one message somebody should have looked at. A new `PermanentDeliveryError` lets a handler say so, and the dispatcher dead-letters it at once: SMTP 5xx and FCM 401/403 immediately, SMTP 4xx and FCM 5xx on the backoff. `starttls` refuses to send if the server does not offer STARTTLS rather than putting the relay password on the wire, and a device FCM calls `UNREGISTERED` has its row deleted instead of retried. Preferences are a rule per notification type with `*` as the catch-all; the unsubscribe link in every footer is public and signed, because nobody should have to sign in to stop receiving email, and it turns off email only — the click happened in an email, and in-app notifications are the record rather than a message. Both fakes speak the real protocols, and the FCM one verifies the service-account assertion against the key pair it generated, so a client that signs the wrong bytes fails in CI rather than at three in the morning. **Not done, and it is not backend work**: the employee app does not register an FCM token yet, so push has nowhere to go until it does. |
| **CW-023** · Notifications had no mail transport | The same work as CW-005 above, written up separately while that one was still open, and delivered with it. Two requirements of this ticket shaped the result and are worth keeping: the handler goes through `OutboxRegistry` rather than round it, so retry, backoff and dead-lettering come from CW-006 rather than being reinvented; and a channel switched on with incomplete configuration now **refuses to boot**, the rule `ASSISTANT_ENABLED` already follows — because the symptom otherwise is an outbox filling with dead letters days later, over a setting the operator believes they already made. The variable is `EMAIL_ENABLED` rather than the `MAIL_ENABLED` proposed here; it was already shipped, documented and tested under that name by the time the two tickets were reconciled, and a rename would have been churn for its own sake. |
| **CW-020** · Nine high-severity advisories in shipped dependencies | Two root causes, not nine: multer below 2.3.0 (four advisories) and deepmerge-ts below 8.0.0 reached through `@prisma/config`. Everything else was npm reporting the parents. Both are fixed upstream but neither parent has picked the fix up — the latest NestJS 11 still pins multer 2.2.0, and Prisma 7 still pins deepmerge-ts 7 — so the fixed versions are pinned through npm `overrides` rather than by taking two major upgrades for a security patch. `npm audit --omit=dev` is clean, and a CI job re-checks it weekly as well as on every push, because an advisory is published against code that has not changed. The upload endpoint also now states its whole contract as multer limits (one part, named `file`, no text fields), which is what actually neutralises the two field-name advisories: they need a text part, and there is no longer one to send. **The ticket's premise was wrong** in a way worth recording: it called multer "reachable from the public careers page". It is not. `POST /careers/:orgCode/jobs/:slug/apply` takes JSON, and the only multipart route in the system, `POST /files/upload`, sits behind the global auth guard — so this was an authenticated denial of service, not an anonymous one. Still worth fixing; not the emergency the ticket described. The upgrade also broke something on the way in, which is the argument for the tests: Nest maps multer errors by matching their *message*, multer 2.4 reworded `LIMIT_UNEXPECTED_FILE`, and a file sent under the wrong field name started returning 500 with a stack trace. The exception filter now reads `err.code`, as multer's own documentation asks. |
| **CW-035** · The README was Thai only | A reviewer who does not read Thai could not assess the project at all, which for something that wants contributors is a hard stop. `README.md` is now English with `README.th.md` alongside it and a switcher at the top of both. This is not CW-016: the *interface* is still Thai-only, and the translation layer for both clients remains open. |
| **CW-034** · The README described the system and showed none of it | Seeing any screen cost a clone, an `.env`, a compose run, a migration and a seed — minutes of commitment from someone who had not yet decided the project was worth any. Twenty-one console screenshots and eight from the app now sit in `docs/screenshots/`, fourteen of them in the README itself. The cross-client recording the ticket also asked for — submit leave on the phone, approve it in the console — was not done; open a new ticket if it is wanted. |
| **CW-022** · A clean install had no way to create an organisation | The only `organization.upsert` was in `prisma/seed.ts`, which the README itself labels demo data, so anyone installing Cwork for a real organisation had to load fake rows and then clean up after them. `npm run db:init` now creates the organisation, the default roles and the first administrator; the web wizard behind a one-time token covers operators with no shell access. 22c746f. |
| **CW-026** · The pilot would have collected real location data with nothing written down | Leave and attendance for real employees means real GPS and real sick-leave records, and full retention and purge (CW-015) was too large to precede it. Two documents instead — one for whoever is accountable, one for the employees themselves — stating what is held, that **location is recorded only at the instant of a punch and never continuously**, how long it is kept, and how to have it removed. bf74102. |
| **CW-027** · The standard install offered an assistant that could not work | `ASSISTANT_ENABLED=false` is the default, so every out-of-the-box deployment showed an entry point that failed when pressed — which reads as a broken product rather than a disabled option. Both clients now read the flag and hide it. 75e3184. |
| **CW-028** · No tags, no changelog, no way to say which version you were running | Anyone installing Cwork ran whatever `main` happened to be that day. `CHANGELOG.md` in Keep a Changelog form, the 0.x contract stated in the README, releases cut from a workflow rather than by hand, and 0.2.0 tagged. 8ad1f41, 0186861, 14ecc0e — and 14894e5, which stopped the docs telling people to clone a tag that did not exist yet. |
| **CW-029** · Contributions had no provenance | Apache-2.0 with no CLA and no sign-off meant no record that a contributor had the right to submit what they submitted. DCO is now enforced in CI. Worth restating rather than discovering later: with no CLA the licence cannot realistically be changed, which is an accepted consequence and not an oversight. d73a589. |
| **CW-030** · Three claims in the documentation were not true | Multi-tenancy the product does not offer, Thai payroll rules nobody qualified has reviewed, and a privacy property that was real but unstated. Each corrected where a reader meets it rather than in a footnote. 419d1e2. |
| **CW-036** · `git log` told the story before the README did | Almost every commit here was written by an AI agent under direction, several of them adding thousands of lines at once. Saying so costs less credibility than having it inferred, and the existing history was left exactly as it stands — rewriting it to look more human would have been the actual dishonesty. c9ba70a. |
| **CW-008** · Issued documents ended in a manual step nobody could audit | `DocumentRequest` resolved to merge data — the fields, not a document — so HR still produced every certificate by hand and the approval trail stopped short of the thing it approved. Rendered server-side now, with Thai text intact. 2a5867d. |
| **CW-009** · Benefits existed in the API and nowhere a person could reach | Models, endpoints and permissions were all there; the console had no screen, so enrolment meant calling the API by hand — and enrolments feed payroll. bf08a8d. |
| **CW-010** · Attendance was computing lateness against shifts nobody could define | `Shift`, `WorkSchedule` and `ScheduleAssignment` drove the late and early-leave minutes, and the only way to create one was the seed script. Until this landed, attendance could not be used by a real organisation at all. 6fd24f4. |
| **CW-015** · Employees had no retention or erasure path | Candidates had a PDPA retention date and were purged; employees had nothing, so a leaver asking for erasure had nowhere to go. CW-026 covered the pilot's minimum; this is the mechanism. a962449. |
| **CW-016** · Every interface string was hard-coded Thai | Nineteen commits: an i18n foundation, then the console screen by screen, the employee app, and both landing pages. Keys are English, Thai is a translation file and stays the default, organisation-entered content is not translated, and the database keeps Gregorian years. c3b3399 … 7c28419. |
| **CW-017** · The console had never been tested with a screen reader | HR software is used all day by people who may not use a mouse. Audited to WCAG 2.2 AA with an axe check in CI. 21a5335 — and 4e7a73f, which found the menu and theme buttons had no name a screen reader could read. |
| **CW-024** · Any device with a valid token could punch | The app generated a stable `deviceId` and every punch recorded it, but nothing authorised it — clocking in for an absent colleague needed only their password. Binding on first sign-in, re-binding behind HR approval and audited, and a punch from an unbound device flagged rather than refused. f30f910. |
| **CW-032** · Nothing proved an existing installation survived an upgrade | CI only ever migrated an empty database. It now checks out the previous release, migrates and seeds, then migrates up and asserts the data is still readable. 80c0216. |
| **CW-033** · A column nothing wrote misled whoever read the schema next | `selfieFileId` was never written and selfie capture was considered and not adopted. Dropped rather than left as decoration. 6411850. |
| **CW-038** · The assistant's configuration accepted values that changed nothing | `ASSISTANT_PROVIDER=openai-compatible` validated, booted clean, reported the assistant as enabled and handed back the disabled provider. Reproducing it turned up two more configurations doing the same thing — `none` with the assistant enabled, and Anthropic with no key outside production — neither of which the ticket named. `ASSISTANT_EMBEDDING_PROVIDER=openai` was the same lie one field down and went the same way. 1872048, 7999e40. **The other half of this ticket did not ship and that is a fault in the ticket, not the work:** the decision was changed to implement a self-hostable provider while the acceptance criteria still described removing the option, and the criteria were met exactly as written. CW-043 carries it with criteria of its own. |
| **CW-039** · Managers saw flag lists and had to guess what they meant | `OUTSIDE_GEOFENCE`, `IMPOSSIBLE_TRAVEL` and the rest told a manager something happened, not whether they were looking at a dishonest employee or a badly drawn geofence. Explained now, scoped to the caller's reports through the same visibility filter the console uses. f77d1df. |
| **CW-040** · Payroll approval was a control on paper | Separation of duties means the approver did not prepare the run; what they saw was a total they had no practical way to interrogate. The variance is narrated against the previous period, from the components the payslip already stores. 2445ad3. |
| **CW-042** · ADR-0004 forbade the features that were about to be built | Its title said assistant tools take no employee id, and it named "lets a manager ask about their team" as the signature it rejected — which read as forbidding CW-039 and CW-040. Amended to the rule it was reaching for: no tool parameter may extend the caller's reach. f849688. |
| **CW-025** · An offline punch could be forged on a rooted phone | The server credits the instant a punch was captured, which is right for someone clocking in at a warehouse with no signal — but the queue sat in `SharedPreferences`, which a rooted device's owner can edit, and the `isRootedDevice` the API accepted was never sent. The queue moved to the keystore, root is detected and reported, and a punch held beyond the ceiling is flagged for a manager to acknowledge — never rewritten, because `attendance_punches` is append-only. The ceiling's real value is still the pilot's to decide. 2af6a71. **Closed phase 2: the pilot can run.** |
| **CW-044** · Every payroll filing would have reconciled its own figures | Five formatters were queued behind this — ภ.ง.ด.1, 1ก, 50 ทวิ, ประกันสังคม, the bank file — and each would otherwise have gathered a period and checked it adds up in its own way, which on these outputs means filing wrong numbers with the Revenue Department. Built once: reconciliation is a pure domain module with its own unit tests, and a period is refused, naming the run or the difference, when a run is not `APPROVED` or its payslips do not add up. It also refuses when the payslip count disagrees with the recorded headcount — a check the ticket did not ask for and should have. 1073152. |
| **CW-049** · A location's code was free text anyone could edit | The ecosystem's location code (ADR-0006): a fixed format, correctable until first use — a punch, a schedule, an export — and superseded rather than renamed afterwards, with the old location keeping its history. A breaking change for existing installs, with a migration that reports before it changes anything. 34cb1ae. |
| **CW-050** · Cwork could not be investigated from its logs | Conforms to telemetry contract **v1.2**, which moved on from the v1.1 the ticket named while the work was under way. String `severity`, a plain `labels` object, `app.log`, and five metrics on a port of their own so `/metrics` is never published with the API. Two acceptance criteria were added mid-ticket from notes written for other systems, and both have tests by their own names: the outbox gauges read from the database, so two instances agree and a restart does not reset them; and a request refused by the auth guard or the throttler still gets its log line. **The ticket's premise was wrong:** it said Cwork emitted a numeric pino `level`. The dependency was installed and never wired in; it was removed, with a `LOG_PRETTY` nothing read. 783171f. |
| **CW-053** · Nothing proved the security headers were served | A fix to nginx's `add_header` inheritance had put CSP and `X-Frame-Options` back on `/assets/` and `index.html`; nothing stopped the next `location` from dropping them again. CI now runs the image as shipped and asserts the headers on the paths that broke. b160cbb. |
| **CW-055** · The phone frame covered the app in the film | Reported by the owner from two screenshots of the film in progress: the frame's camera cut-out sat on the app's greeting and its border clipped the right edge. The phone is now drawn with a status bar and a home-indicator strip around the app's full 390×844 screen, so neither covers any of it. Both takes were re-recorded from `docs/film/stage.html`, not patched. The PO checked frames from every chapter of both takes before closing. 18624fe. |
| **CW-057** · SECURITY.md described a system that no longer existed | Found while reviewing the ERP's ADR-0022. Three of its five "known gaps" had closed weeks earlier (MFA, malware scanning, shared rate limits), and "Supported versions" was still waiting for a first tag after four releases. It now lists only gaps true of the current release, adds the tenant-boundary gap, says that during 0.x only the latest release receives security fixes, and gives the four ecosystem projects' private channels. Cwork adopted ADR-0022 on 2026-09-27, and the section links it rather than restating it. **The first pass contradicted the ADR:** it required every project that adapted vulnerable code to ship a fix before any advisory, dropping decision 9's "or its owner has said it is not affected". By that wording GHSA-3cgw-73cr-r8c6 could not have been published, even though the section cited it as the example. The PO compared the section with the merged ADR before closing. The changelog entry carried the same wording and was corrected after closing. 5d14915, bc76d4c, e675493. |
| **CW-059** · A company moving to Cwork had to type every employee in by hand, and its first payroll ignored the months paid before it | Two spreadsheet imports, each from `.xlsx` or Thai Excel's default CSV, with a preview that lists every problem by row and column and writes nothing until the whole file is clean. **Employees and leave already taken** (0b44fd3, df09d81): the second run of the same file is refused row by row, balances equal entitlement minus the days imported, and scanner IDs are kept for CW-061. **Pay before Cwork** (e4715b5): each employee's taxable income, tax withheld and social security from January to the last month paid elsewhere. These are stored as **this employer's own** (`PayrollOpeningBalance`), not as `priorEmployerIncome`, because the annual filings must count them as its own pay. `yearToDate()` keeps the three sources apart, and each payslip's snapshot records the split. The acceptance is an e2e test: nine months run in Cwork, the same eight months imported into another year, and September compared employee by employee. A month the figures cover cannot be calculated again (`PAID_BEFORE_CWORK`). **Not proven here:** that ภ.ง.ด.1ก and 50 ทวิ count these months. Neither filing exists yet, so the requirement is written into the acceptance of CW-046 and CW-047. The import creates no sign-in accounts (CW-064). Closed 2026-10-02. |
| **CW-058** · Thai screens wrote the year in the Gregorian era, and date fields were the browser's own | Thai offices count years in พ.ศ.; a competitor opens its landing page with exactly this. The first part (db7b284) made `formatDate` write the Buddhist-era year. The rest (a1dd8bf): a `DateInput` built in the repo replaces all 15 native date fields, so in Thai a date is typed or picked day first in พ.ศ. and stored as the ISO date, while English keeps the browser's own field; pay periods show as months; the app's `Fmt.period` and date picker use พ.ศ.; the employment certificate writes "15 มกราคม 2567"; Thai notifications and errors that carried an ISO date write a Thai one. `expectNoAxeViolations` now fails on a Gregorian year on any Thai screen, and source guards in both clients refuse native date inputs and raw years. Choices made by the dev and accepted by the PO on 2026-10-10: the field is built rather than taken from a library, since none writes พ.ศ. and the console has no UI library; a two-digit year is the end of a พ.ศ. year and a four-digit year under 2400 is read as Gregorian, an unreadable date is marked and the old value kept; `min` greys out calendar days only, typed dates are left to the server as before; a new pay period's year and month are picked from lists; there is no payslip PDF, so the in-app payslip writes its pay date in words; the backend messages above were changed beyond the ticket's files because the app shows them. A UTC issue date the dev found on the way is CW-074 (#79). Closed 2026-10-10. |
| **CW-074** · A certificate issued before 07:00 was dated the day before | Found by the dev while finishing CW-058: the issue date was the UTC date, a day behind Bangkok until 07:00, and verification read it the same way. Both now take the organisation's calendar day (`organizationToday`, by the rule `workDateFor` uses for punches), tested with the clock fixed at 06:30 Bangkok time on 1 October 2026; the same test gave 2026-09-30 before the fix. The same UTC "today" was replaced in leave notice days and cancellation, resignation dates and notice, the daily close-out of separations (which finished people a day late), structural-change effective dates and the compensation a certificate quotes. **Left as they are:** a few places still take the current *year* from UTC (the leave-balance year default, document reference numbers, expense years, file paths); they can be wrong only between 00:00 and 07:00 on 1 January. 94e96dc, closed 2026-10-10. |
| **CW-070** · The pilot's labourers draw cash before payday, and nothing recorded it or took it back | Someone with `payroll:run` records an advance once it is paid (who, how much, the day, cash or transfer), never dated in the future. What is owed is worked out from deductions, never stored. A regular run takes back every advance owed up to the period's last day, after tax, social security and every other deduction, oldest first, one payslip line each, and never more than the payslip would pay; the rest is carried with `ADVANCE_CARRIED_OVER`, whose Thai text says that recovering it later may fall under section 76 and is not yet checked. An advance taken back by an approved or paid run is locked; one changed under a calculated run blocks approval until it is calculated again; a cancelled run gives back what it took. A Cash advances page lists what each person owes and which run took it back. Accepted from the dev: an advance recorded after a run was calculated waits for a recalculation or the next run, and does not block approval. Still open: the final-settlement run does not take advances (HR settles them by hand); section 76 is CW-078. 3b00760, closed 2026-10-10. |
| **CW-075** · Social security used the 2025 wage ceiling in 2026 | Verified against the Royal Gazette (vol. 142, part 81 Kor, 12 December 2025, pages 5–6): the section 33 ceiling is ฿17,500 for 2026–2028, ฿20,000 for 2029–2031 and ฿23,000 from 2032, floor ฿1,650. The ceiling now comes from the period's year (`taxRulesFor`, `SOCIAL_SECURITY_CEILINGS`), so a later step is a new row, not a code change. The ฿9,000 yearly stop is gone: it was 12 × ฿750 of the old ceiling, not a rule in the Act, and kept it would have skipped December at the new rate. Income tax relief for social security is its own table (`SOCIAL_SECURITY_RELIEF_CAPS`, ฿9,000 to 2025, ฿10,500 for 2026, the last figure kept until the Revenue Department announces another), checked against secondary sources only, and the docs say so. A read-only shortfall report (Payroll → ส่วนต่างประกันสังคม, `GET /payroll/reports/sso-shortfall`, `payroll:export`) compares paid runs with the year's ceiling per employee per month, halves added up first, with totals per month and year, a CSV in Thai or English that is audit-logged, and a note that it is not a filing; it writes nothing to payroll. Thai guide `docs/guide/sso-shortfall.th.md`. Accepted from the dev: payslips from before CW-069 have their social security wage rebuilt from BASE and earnings counted towards it, labelled as such; paid runs count in any period and other non-void runs in LOCKED or CLOSED periods, never OPEN; payslips outside social security are skipped; CSV cells starting with = + - @ are escaped; years outside 2000–2100 are refused with INVALID_YEAR; three e2e files moved their years because they relied on one ceiling for every year, none skipped. Owner's decision: January–October 2026 runs already paid are reported for HR to settle, not recalculated. 87540c5, closed 2026-10-11. |
| **CW-069** · The pilot pays its labourers a daily wage every 15 days, and Cwork could only pay a monthly salary | A compensation can carry a `dailyRate` paid `SEMI_MONTHLY`, and a month can be paid in two periods, `YYYY-MM-H1` and `YYYY-MM-H2`, with one monthly period and one of each half per month enforced by the database. Days paid come from attendance, paid leave by its portion and paid holidays on working days. Social security is 5% of H1 with no floor, then the whole month less H1; withholding is half the estimated month, then the month less H1; neither goes negative, and any excess is a warning. H2 needs H1 marked paid. Each work location holds the minimum daily wage with its source. In the console: a pay card on the employee page that carries overtime, social security and provident fund over to a new rate, half-month periods with locked dates and labels such as "1–15 พฤศจิกายน 2569", the nine payslip warnings in Thai on the run page, and on an H2 run whose H1 is unpaid, the reason and a link to H1. Every figure in the tests is computed by hand; the comparison with the pilot's Excel is still to come at Pilot B. The legal basis of sections 56 and 62 is checked only from secondary sources, and 29 and 68 not at all (CW-076). 037e108, 8662703, closed 2026-10-10. |
| **CW-067** · Only the employee could file their own leave, and at the pilot nobody but HR uses Cwork | HR now records leave for any employee they can see, including one with no account, under a permission of its own (`leave:record`, granted to the system HR roles by migration; a custom role needs it added by hand). Recorded as approved by default, or sent to the manager. The same rules refuse it with the same codes. Two choices made by the dev and confirmed by the PO on 2026-10-09: leave recorded as approved skips the notice and supporting-document rules, because HR records what already happened, while leave sent to the manager keeps both, so a past day cannot go to the manager, just as the employee could not file it; and HR cannot record their own leave as approved (`CANNOT_RECORD_OWN_LEAVE`), since that would remove the only other pair of eyes. The record keeps who entered it, and the audit entry names both. **Found and fixed on the way:** approving leave after its days began, or cancelling approved leave, did not re-derive attendance, so payroll deducted a paid sick day closed out as absent. Days payroll has locked are left alone. f254b50, closed 2026-10-09. |
| **CW-068** · Foreign workers could not be imported, and their documents had nowhere to go | The pilot employs foreign workers, and the import required a Thai name and had no column for their documents. An employee now carries a passport number and a work permit number, both encrypted like the national ID, readable only with `employee:read:sensitive`, redacted in the audit log and purged with the other identifiers, and the expiry date of each, which is not secret. The import takes the four columns and a row with an English name only and no national ID; a row with neither name is `NAME_REQUIRED`. Choices made by the dev and accepted by the PO on 2026-10-10: the employee page gets a card for the four fields, because the console has no form to create or edit an employee; an English-only name is also stored in the Thai name fields, which are the ones Cwork displays; someone who may edit but not read the numbers sees only whether one is on file and leaves the field blank to keep it; a passport number is 5 to 20 letters and digits after spaces and dashes are dropped. Expiry alerts were split out as CW-073 (#78); the page only marks a date already passed. d89dd40, closed 2026-10-10. |
| **CW-072** · A fresh install had no departments, and the console could not add one | The employee import needs departments, positions and work locations to exist already, so an Odoo export failed with one `NOT_FOUND` per row. Organisation now adds and renames departments and positions, and adds work locations, through the endpoints that were already there. A work location's code follows ADR-0006 and is never offered for renaming. The form also refuses a duplicate name, which the API allows but the import would call ambiguous. Walked by the dev on a fresh `db:init` install through to an import with no `NOT_FOUND`. eeaa3c9, closed 2026-10-09. |
| **CW-079** · Only the first administrator could ever hold more than the employee role | Found by the dev while writing CW-070: nothing in the API or console gave an account a role. An account's roles are now listed, granted and removed from the employee's page by someone with `role:manage`, system roles only, with an optional department and expiry. A role can only be handed out by someone who already holds every permission in it; a department limit applies to roles that read employees without managing roles or the organisation, and is worked out per grant. No one removes their own `role:manage`, and the last `SUPER_ADMIN` cannot be removed, checked under a transaction-scoped advisory lock. Every grant and removal is audited and signs the account out (`sessionsValidFrom`, refresh tokens revoked); the console warns that a privileged role means enrolling a second factor at next sign-in. The account lookup is limited to employees the actor can see. `docs/security.md` and `docs/operations.md` say what the console does and what still needs the database. 06330b4, 65ba360, 09099de, 471d9ed, closed 2026-10-11. |
| **CW-078** · The carry-over warning for cash advances said section 76 was unread | The PO read sections 76 and 77 in the consolidated text to 2019. `ADVANCE_CARRIED_OVER` (Thai and English), `docs/payroll-thailand.md` and the Thai guide now say that repaying an advance is not among the deductions section 76 allows, that taking a carried balance from a later payday may need the employee's written, signed consent naming that purpose (section 77), and that Cwork does not keep that consent, so HR must. The question is on #36 for a qualified reviewer. The advance payslip line is coded `CASH_ADVANCE`, apart from the demo seed's standing `ADVANCE` deduction, tested together. Accepted from the dev: "Who records them" points to giving an HR officer the payroll officer role from the employee's page (CW-079). 0874e40, closed 2026-10-11. |
| **CW-076** · A daily-wage worker was paid nothing for a holiday on the weekly day off, and rest-day work at the salaried rate | Verified against the consolidated Labour Protection Act to 2019 (Krisdika), sections 29, 56, 61, 62, 63 and 68, none amended in that text; amendments after 2019 are not checked. A half-month run for a daily-wage employee moves a traditional holiday on the weekly day off to the next working day of the employee's own schedule that is not a holiday (two in a row take the next two), looking a month back and ahead, so a substitute in the next half is paid there; the payslip lists each substitute (`SUBSTITUTE_HOLIDAY`). Rest-day overtime below the daily-wage minimum is raised on the payslip, at least 2× on the weekly day off and 1× on a traditional holiday (`REST_DAY_RATE_RAISED`); the overtime request keeps the organisation's rate. Salaried pay is unchanged. Accepted from the dev: a holiday HR entered always counts as its own holiday (the double payment this causes is CW-081); work on a substitute day is paid as the holiday and flagged for HR to record as overtime (`SUBSTITUTE_HOLIDAY_WORKED`); an employee who leaves before the substitute day is flagged as owed (`HOLIDAY_ON_DAY_OFF`); 1.5× (s.61) and 3× (s.63) stay as the organisation sets them. 948396d, closed 2026-10-11. |
| **CW-081** · A substitute holiday was two different days to payroll and to attendance | `resolveWorkCalendar` decides, per employee and day, whether it is a working day, a weekly day off, a holiday or a substitute, from the employee's schedule and daily shift changes and both the organisation's and the work location's holidays; attendance, leave, overtime type and the daily-wage run all use it. A holiday row can name the holiday it stands in for (`substituteForId`, nullable, one substitute per holiday, after it, same location, no substitute of a substitute; a holiday with a substitute cannot be deleted), set from the organisation page, which also shows the automatic substitute for a Monday–Friday schedule. Tested on 5 December 2026 with and without 7 December entered: the salaried employee is on holiday, not absent, on the 7th; leave on the 7th alone is refused and 7–8 counts one day; overtime on the 7th is holiday overtime at 2×; the daily-wage worker is paid the 7th once (10 days, 5,000, plus 500 overtime). `SUBSTITUTE_HOLIDAY_WORKED` is gone. Accepted from the dev: an entered substitute applies only to employees whose holiday fell on their day off and for whom it is a working day, otherwise the automatic one; existing rows entered as substitutes count as their own holiday until linked (0.4.0 upgrade notes); daily shift changes to a day off count as a day off everywhere; attendance and overtime now see work-location holidays. Left: monthly proration (CW-082) and days closed before the upgrade. 3621a32, closed 2026-10-11. |
| **CW-071** · The pilot pays in cash to staff without smartphones, and a payslip on a screen reached nobody | An approved or paid run prints as PDF from the run page: payslips one, two or four to an A4 sheet (cut lines; a long slip shrinks its type, then takes its own page, never drops a line) and a wage-receipt sheet with one row per employee, net pay, a space to sign, totals and page numbers. Dates in พ.ศ., Sarabun embedded and checked for missing glyphs, a foreign worker's name as HR entered it; a daily wage prints as days × rate, `CASH_ADVANCE` on its own line, a substitute holiday as a note. Every line of a printed slip is tested against the payslip record the API returns. Printing needs `payroll:read`, refuses a run not yet approved (`PAYROLL_RUN_NOT_PRINTABLE`) or a slip whose lines do not add up (`PAYSLIP_DOES_NOT_ADD_UP`), and is audited as an export of the run. Accepted from the dev: only `SUBSTITUTE_HOLIDAY` prints, other warnings stay HR's; "matches the screen" means the API payslip record, as the console has no payslip page yet; employees printing their own slip is not in this ticket; the receipt's wording is a template, with three questions for an accountant on #36. Two holiday-page fixes from the browser walk of CW-081 ride along (the substitute picker's layout, and no automatic note under a holiday with an entered substitute). Guide: `docs/guide/printing-payslips.th.md`. a26329b, closed 2026-10-11. |
| **CW-084** · Social security was rounded to the satang and was nothing below the floor; the official form says otherwise | Verified against the Social Security Office's announcement on contribution forms (No. 2) B.E. 2568, Royal Gazette vol. 142, special part 405 Ng, 30 December 2025, pages 23-27, notes 1, 3, 4 and 6. `computeSocialSecurity` is the one monthly figure per person: the wage, the 1,650 floor and the ceiling of the period's year, rounded to the baht half up, the employer's share equal; a month with no wage contributes nothing. A half-month run takes 5% of H1 (capped, whole baht, no floor) and H2 is the month less H1, so the pair equals a monthly run; the CW-075 shortfall report uses the same function. Hand-computed: 5,010 gives 251 and 251, 1,200 gives 83, 20,000 in 2026 gives 875, a half-month pair of 5,010 gives 125 + 126. Approved and paid runs are not recalculated; months already paid keep their satang, which the shortfall report shows. Three questions for an accountant on #36. d5b35a4, closed 2026-10-11. |
| **CW-048** · The monthly social security filing (สปส.1-10) had no way out of payroll | Payroll → monthly social security filing, and `GET /payroll/reports/sso-filing?year=&month=&format=json|csv|xlsx|pdf`, give the form's part 1 (total wage, employee and employer contributions, their sum, the number of insured) and part 2 (one row per person in employee-code order: sequence, national ID, or the social security card number for a foreign worker, name, wage, contribution). Contributions are `computeSocialSecurity` (CW-084) on the month's wage with both halves added first, so the form and the payslips use one rule; each row also shows what the payslips deducted and is marked where it differs. Tested in the e2e at the period year's ceiling (23,000 in 2037 gives 1,150), under the floor (1,470 gives 83) and with a month of no wage listed as nil (note 6). Someone with no valid number is named and every download is refused (`SSO_FILING_HAS_PROBLEMS`); a month with a period not yet approved or paid, or a half-month month missing a half, is refused (`SSO_MONTH_NOT_FINISHED`). Needs `payroll:export` (it carries ID numbers); every read and download is audited as an export, without the numbers. Accepted from the dev: a foreign worker is anyone with a passport or work-permit number on the record, as Cwork stores no nationality; "wage actually paid" is the wage social security is worked on, overtime left out, asked as question 4 on #36; the console defaults to the month just finished, dates in พ.ศ. Guide: `docs/guide/sso-filing.th.md`. Left: the e-Services upload file and the November check (CW-085). 8bb7757, closed 2026-10-11. |
| **CW-082** · A monthly salary prorated in a month with a substitute day counted that day as a working day | A salaried joiner's or leaver's pay, and the value of an unpaid day, are now worked out over the employee's own work calendar (`WorkCalendarService`: their schedule, the organisation's and the work location's holidays, substitute days as days off), not Monday to Friday less the organisation's holidays. The method in `docs/payroll-thailand.md` is unchanged: base × days paid ÷ the period's working days, counted as if employed all period, so a holiday before someone joined still takes its substitute out of the month. Checked by hand in the e2e for December 2026 at 20,000 (20 working days after 7, 10 and 31 December): a joiner on the 9th gets 15,000.00 (was 14,285.71), a leaver after the 4th 4,000.00, one absent day 19,000.00, a full month 20,000.00 as before; the test fails with the old figures when the substitute day is taken out. Accepted from the dev: a full-month employee with unpaid days in such a month is docked at the corrected day's value, which is the fix; a schedule with Saturday as a working day now counts Saturdays; approved and paid payslips are not recalculated. 6fffdeb, closed 2026-10-11. |
| **CW-083** · A department limit on the payroll officer did not limit pay, and the console did not say so | When a department limit is chosen for a role, the account-roles card on the employee page now names, before saving, what the limit does not narrow, in Thai and English: pay (payroll runs, payslips, printed payslips, wage receipts, compensation), resignations and the audit log. The list is data, not role names: `OUTSIDE_THE_DEPARTMENT_LIMIT` and `unlimitedAreas()` in `organization/role-grants.ts`, returned per role by `GET /employees/:id/roles` as `unlimitedByDepartment`, so a new role or permission is covered by adding it there. Saving is not blocked and who sees pay is unchanged. `docs/security.md` and `docs/guide/account-roles.th.md` say the same. Accepted from the dev: MANAGER holds only `employee:read:team`, so no department limit can be chosen for it and no note appears (tested in unit, e2e and web); resignations and the audit log were found outside the filter while tracing the code and added to the list, so PAYROLL_OFFICER, HR_OFFICER and AUDITOR now show the note. Whether payroll should honour a department limit stays an owner's decision. c764fca, closed 2026-10-11. |
| **CW-088** · A cash payday had no way to count the notes and coins | Payroll → run page → "พิมพ์ใบเตรียมเงินสด", and `GET /payroll/runs/:id/print/cash`, print an A4 landscape PDF: one row per person with the exact net pay, how many of each note and coin (1,000, 500, 100, 50, 20; 10, 5, 2, 1, 0.50, 0.25, largest first), the cash for the envelope and the remainder under 25 satang, which is shown and never rounded into the pay; then the run totals per denomination and the amount to withdraw. Counted in whole satang (`splitCash` in `documents/cash-sheet.ts`), so no float rounding; no setting to skip a denomination, as the pilot hands out all of them. Same rules as CW-071: `payroll:read`, a run not approved or paid is refused (`PAYROLL_RUN_NOT_PRINTABLE`), audited as an export (`cash-sheet`, with the withdrawal total), Sarabun with the glyph check. Tested by hand-worked figures (12,345.67 gives 12,345.50 in cash and 0.17 left; three people netting 20,345.66 withdraw 20,345.25) and in the e2e against an independently worked split. No schema change. Guide: `docs/guide/printing-payslips.th.md`. Still open, not code: the page says its layout awaits the pilot's blank paper form, to be compared when it arrives; how the pilot pays a remainder under 25 satang; what the pilot's accountant keeps as proof of a cash payday (the owner is asking). 8d15223 and 5bdd09c, closed 2026-10-16. |
| **CW-061** · A company on a fingerprint scanner had no way to bring its punches in | Attendance → scanner days (`/attendance/scanner`, `attendance:manage`, not for a department-limited user): upload the export, preview it, then import; nothing is written until HR imports. The file is read from its byte-order mark, never its name (the pilot's TA-001EX writes UTF-16LE text with a mark, tab-separated, no header, fields padded and ending in a comma); a year outside 1990-2100, a Buddhist-era year for instance, is a problem, not a silent read. Two times count (first in, last out); no time is no punch (leave and absence come from the calendar and leave records); one time, or three or more, waits for HR; a scanner number with no employee is listed apart with its days, not an error. HR picks in and out from the day's times or leaves the day uncounted, decisions are kept apart from the raw times and can be changed, every raw row stays visible, and the totals follow each decision. A decision holds only while its day has the same times: a later file that adds a time puts the day back to waiting on HR and stops counting the punches it had counted, which stay in the append-only punch table and are filtered out by `ACTIVE_PUNCH`. Counted times are ordinary `BIOMETRIC` punches, not flagged for having no location; an overlapping file adds only new punches and does not touch days a payroll has used; each import is one audit event (file, date range, punches added); nothing but name, number, date and times is accepted, checked by an e2e on the columns written. Accepted from the dev: the same minute written twice on one day is one tap, counted once. Tested on synthetic files only; `.gitignore` keeps `Export*.xls`, `Export*.XLS` and `Export*.txt` out. Guide: `docs/guide/scanner-import.th.md`. Left: the check against the pilot's real export, run on the owner's own machine; lateness, overtime, shifts and shifts across midnight (not known to be needed); a field to change an employee's scanner number on the employee page (today through the CW-059 import or `PATCH /employees/:id`), not queued. 6afcf2e and 6db7bf2, closed 2026-10-17. |
| **CW-089** · The accountant who files ภ.ง.ด.1 had nothing to work from, and nothing showed when a filed total differed | `GET /payroll/periods/:id/export?format=accountant` is the existing export, every column in its order, plus two only: the employee's tax ID (the stored one, else the national ID, else empty) and the income type, 40(1) on every row since Cwork's payroll is employment income only; `payroll:export`, audited as an export with the count of rows missing a tax ID and never the numbers; an e2e checks every money figure equals the existing export and that the plain CSV still prints no ID. Payroll → compare with what was filed (`/payroll/compare`): HR enters the filed tax total and the filed social security total (employee and employer together) and sees Cwork's figure beside each with the difference, one satang either way shown as different; on the same page HR uploads its own per-person figures (code, gross, tax, social security, net) for a parallel run and every person and column that differs is marked, nothing kept and no payslip changed (checked field by field against a snapshot). Accepted from the dev: a period whose runs are paid now exports as well as one that is approved (`reconcilePeriod` allows APPROVED or PAID, as the social security file already did), since the accountant files after payday; a draft or calculated run is still refused. Free, tied to no key; synthetic test data only. Guide: `docs/guide/period-check.th.md`. Left for the owner: what HR sends the accountant today (the column order follows the existing export until then), whether e-Filing needs a finer income code than 40(1), and whether the first payroll runs beside HR's method once. dbf6e9b and 4a40efe, closed 2026-10-17. |
| **CW-090** · HR could not set or correct an employee's scanner number without the API | The employee page has a scanner-number card for users who may edit employees: the number is kept as written (`007` stays `007`), cleared by saving it empty, and a number another employee holds is refused with a Thai message. Saving a new number counts that number's days that nobody owned yet, straight away: two-time days become punches, the rest wait for HR on the scanner page, which the card says after saving. Days HR decided, days already counted under an old number and days payroll used do not move. The update is audited with the old and new number, plus a row with the count of days matched. `docs/guide/scanner-import.th.md` now says where to change it. e2e covers keeping zeros, matching waiting days, old days staying put, locked days, duplicates and clearing. 39152de and 2a6e6bb, closed 2026-10-17. |
| **CW-065** · A single new hire needed a one-row import file | An "Add employee" button on the directory opens `/employees/new` with the import's fields and checks (Thai or English name alone, hire date, ID number with or without dashes, probation not before hire, a bank account complete or left out entirely) and posts to the same `POST /employees`; ID numbers and the account number are encrypted as in the import. The backend gained an optional bank account on create and the `PROBATION_BEFORE_HIRE` check. Creating a sign-in waits on CW-064. e2e and web tests added. 8308aaa and 1f85420, closed 2026-10-17. |
| **QA pass 1 findings (#94–#97)** · Found by the Pilot A QA pass, 2026-10-17 | #94/#95: a scanner day inside a period the employee was paid for (a paid run with a payslip for them) is locked whether or not it had an attendance record; a decision is 422 `DAY_LOCKED`, a later file adds no punch, and locked days leave the waiting queue and `totals.waiting` for their own LOCKED filter. Decided by the PO: a day forgotten before payday is corrected in the next period, never in the paid one; the guide says so. #96: `check.sh` reads `/proc/net/tcp` and `tcp6` when neither `ss` nor `netstat` exists, and warns that it cannot tell rather than calling a port free. #97: `deploy/nas/change-address.sh`; the Thai guide gains the authenticator and recovery-code step, the corrected address-change row, `PATH` in the Task Scheduler line, and `install.sh` no longer asks for a backup folder it was given. The QA room re-tested S15 on `814ecc5` and it passed. Its one minor note, the import result counting no locked days for new days the review list already flags, is fixed in `6103469`: the preview (new `lockedDays` field) and the import result count every locked day of the file with the review page's `LockedDays` rule, with one e2e and one web test. The same run moved the empty-year shortfall test to 2041, because a year another spec pays in made it depend on spec order (`5141da5`). 133d884, a2ca743 and 6103469, closed 2026-10-17. |
| **CW-073** · A foreign worker's passport or work permit could lapse with nobody told | `GET /employees/expiring-documents` (`employee:read`) lists active employees' passports and work permits expiring within 30, 60 or 90 days or already expired, with names, codes, dates and the window, never a document number; the console has an Expiring documents page off the directory. A daily job (`document-expiry-notices`, 02:00 UTC, its own lock) tells everyone who may edit the employee once per window (90, 60, 30) and once more on expiry, department-scoped users only about their own department; sent windows are kept in `employee_document_notices` (additive migration). A renewal is a new date and starts its own windows; a date first entered inside 30 days notices that window only; leavers are neither listed nor notified. e2e covers once-only notices over repeated runs, renewal, the four windows in turn, expiry, leavers, missing dates and permissions, and no document number in the list or the notice. Guide: `docs/guide/expiring-documents.th.md`. 1be372f and 15a40f7, closed 2026-10-17. |
| **CW-095** · A manager's pages asked for departments and got 403 | Signed in as the seeded manager, the employee register and the roster tab called `GET /departments`, which needs `org:read`, and filled the console with 403s. PO decision: no new permission, because `org:read` opens more than department names. `useDepartmentOptions` (`web/src/lib/departments.ts`) lists every department for someone with `org:read`, empty ones included; without it, it never calls `/departments` and builds the list from the people the user can see (one page of `/employees`, 200, the API's ceiling), one entry per department. Both pages use it. Eight web tests; the manager tests fail on the old code. Known limit: a manager who sees more than 200 people may miss a department whose members are all past the first page. `EmployeeCreatePage` and `AccountRolesCard` still ask, both HR-only. No role changed. PR #111, `be5d6e2`, merged at `7a589eb`, closed 2026-10-18. |
| **CW-096** · QA pass 2 found four small faults before the pilot (#112–#115) | One PR, in the PO's order. **#114:** the cash-preparation sheet printed a red project note under its title that named the pilot company; the note is gone from the code and the page, the "ลำดับ" column is 36 pt so its header fits, and tests measure every header in the real Sarabun font and fail if the note's words come back. **#113:** text on `--brand` uses `--text-inverse` (white in the light theme, `#0f1116` in the dark), 7.2:1 in the dark theme, covering primary buttons, the logo mark, the selected day and the user's chat bubble; the light theme is unchanged. **#112:** `web/src/lib/api-messages.ts` maps the scanner flow's business-rule codes to Thai, with values from new `details` on three backend errors (codes and statuses unchanged); English and unknown codes still show the server sentence. **#115:** `ErrorState` draws an `alert` icon; task 3 of the HR guide names the "ค่าจ้าง" card and its two buttons. The first CI run was red: `payslip-print.e2e-spec.ts` still required the removed note, and the dev room had run only the scanner e2e; fixed in `c107be8`, then the full e2e suite passed locally. PR #117, `481acdb` and `c107be8`, merged at `4b78ff0`, closed 2026-10-18. Left for CW-097: the README picture still shows the note, danger red in the dark theme, "ค่าตอบแทน" in payroll warnings. |
