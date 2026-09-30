# Handoff — งาน UX/UI รอบ 30 ก.ย. 2026

เอกสารส่งต่อสำหรับคนที่รับงาน UX/UI ของ Cwork ต่อ (คนหรือ agent): ทำอะไรไปแล้ว
ตรวจอะไรแล้ว อะไรยังไม่ได้ตรวจ และควรทำอะไรต่อ

## ขอบเขตของบทบาทนี้

- **ทำได้เต็มที่:** หน้าตา การจัดวาง ข้อความบนจอ สี ขนาดปุ่ม ไอคอน ลำดับการกด
  ทั้ง web console (`web/`) และแอปมือถือ (`mobile/`)
- **ห้ามแตะ:** หน้า Login / การยืนยันตัวตน / 2FA และสูตรหรือกฎธุรกิจทุกอย่าง
  (เงินเดือน ภาษี วันลา การลงเวลา — ทุกอย่างใน `backend/src/modules/*/domain/`)
  การเปลี่ยนรูปแบบการ *แสดง* ตัวเลขทำได้ แต่ห้ามเปลี่ยนค่าที่คำนวณ
- ผู้ใช้เป้าหมาย: เจ้าหน้าที่ HR และพนักงานทั่วไปที่ไม่ใช่สาย IT
  ภาษาไทยเป็นภาษาหลัก ภาษาอังกฤษเป็นภาษารอง

## สิ่งที่เปลี่ยนในรอบนี้

### Web console

| เรื่อง | ไฟล์หลัก |
|---|---|
| สถานะ/ชนิดข้อมูลที่เคยโชว์เป็นรหัส (`CLOSED`, `DRAFT`, `LOGIN`, `User`, `HR_ADMIN`) เปลี่ยนเป็นคำที่อ่านได้ทั้งไทยและอังกฤษ | `web/src/lib/labels.ts`, `web/src/lib/i18n/messages.th.ts` |
| Test ที่ fail ถ้ามี label ไหนยังไม่มีคำแปลไทย | `web/src/lib/__tests__/labels.test.ts` |
| หน้าบันทึกการใช้งาน: ตัวกรองแบบเลือกจากรายการแทนการพิมพ์ชื่อ model (ค่าที่ส่งไป API เหมือนเดิม) | `web/src/features/settings/AuditPage.tsx` |
| ไอคอนเมนูเป็น SVG แทนสัญลักษณ์ Unicode ที่บางเครื่องแสดงไม่ออก | `web/src/components/ui/icons.tsx`, `web/src/app/navigation.ts` |
| ตัวอักษร 14→15px, ปุ่ม/ช่องกรอกสูงขึ้น, จอสัมผัสสูงอย่างน้อย 44px, ช่องกรอกบนมือถือ 16px (กัน iPhone ซูม), รองรับ reduced motion | `web/src/styles/app.css` |
| ปุ่มเมนูบนมือถือมีคำว่า "เมนู", ซ่อนแถบบนที่ซ้ำหัวข้อบน desktop, แสดงบทบาทเป็นชื่อ | `web/src/app/AppLayout.tsx` |
| ตารางเวร: ช่องละบรรทัดเดียว คอลัมน์ชื่อค้างขณะเลื่อน | `web/src/features/attendance/RosterPage.tsx`, `app.css` (`.table--roster`) |
| กล่องตัวเลขบนแดชบอร์ดกดได้ (`Stat` รับ `to`), พนักงานเห็นปุ่มติดตั้งแอป | `web/src/components/ui/index.tsx`, `web/src/features/dashboard/DashboardPage.tsx` |
| หน้าไม่มีสิทธิ์/ไม่พบหน้า มีปุ่มกลับหน้าแรก | `web/src/app/guards.tsx`, `web/src/features/settings/NotFoundPage.tsx` |
| ปิดแผนสวัสดิการต้องยืนยันก่อน | `web/src/features/payroll/BenefitsPage.tsx` |

### แอปมือถือ

| เรื่อง | ไฟล์หลัก |
|---|---|
| สีป้ายสถานะมีความหมาย (เขียว/เหลือง/แดง/ฟ้า) แทนสีชมพูจาก tertiary ของธีม | `mobile/lib/core/theme/app_theme.dart` (`StatusColors`) |
| ปุ่มลงเวลาออกเป็นสีส้ม (`ClockOutColors`), ปุ่มลงเวลาสูง 56px | `app_theme.dart`, `mobile/lib/features/home/presentation/home_screen.dart` |
| ไม่แสดงเวลากะซ้ำเมื่อชื่อกะมีเวลาอยู่แล้ว | `home_screen.dart` (`_shiftLine`) |
| วันลาแสดง "6 วัน" แทน "6.0 วัน" (`Fmt.days`) และงวดสลิปแสดง "สิงหาคม 2026" แทน "2026-08" (`Fmt.period`) | `mobile/lib/core/utils/formatters.dart`, หน้า leave และ payslip |

รายละเอียดเหตุผลของแต่ละเรื่องอยู่ใน commit message และ `CHANGELOG.md` หัวข้อ
`[Unreleased] → Changed`

## ตรวจแล้ว / ยังไม่ได้ตรวจ

**ตรวจแล้ว**
- Web: `npm run typecheck`, `npm run lint` (warning 2 ตัวที่มีอยู่ก่อนแล้วใน
  `router.tsx`), `npm test` (ผ่านทั้งหมด), `npm run build`
- Web: ถ่ายภาพหน้าจอก่อน/หลังด้วย Playwright ที่ 1280×800 และ 390×844
  ในบทบาท HR และพนักงาน กับบริษัทเดโม
- Mobile: `dart format`, `flutter analyze --fatal-infos` (ไม่มี issue), `flutter test` (ผ่าน 86 ตัว)
- `node scripts/license-headers.mjs` ผ่าน

**ยังไม่ได้ตรวจ**
- **ภาพหน้าจอแอปมือถือจริง** — เดโม (`DEMO_MODE=true`) ปฏิเสธการเข้าสู่ระบบด้วยรหัสผ่าน
  จึงยังไม่ได้เปิดแอปดูสีใหม่ ตรวจในข้อ 1 ของ CW-063 บนเครื่องจริง ทั้งธีมสว่างและธีมมืด
- ~~ภาพหน้าจอใน README และหน้า landing~~ — ถ่ายใหม่แล้ว (CW-063 ข้อ 2) ด้วยฟอนต์จริง
  วิธีถ่ายดูหัวข้อ "ถ่ายภาพหน้าจอใหม่" ด้านล่าง ภาพ social preview ของ GitHub
  สร้างใหม่แล้วแต่ต้องอัปโหลดเองใน Settings
- ยังไม่ได้ทดสอบกับผู้ใช้จริงที่ไม่ใช่สาย IT

## วิธีเปิดดูในเครื่อง (แบบที่ใช้ในรอบนี้)

```bash
# Postgres 16 + pgvector (migration ต้องใช้ extension "vector")
apt-get install -y postgresql-16-pgvector
service postgresql start
su postgres -c "psql -c \"CREATE USER cwork WITH PASSWORD 'cwork' SUPERUSER;\""
su postgres -c "createdb -O cwork cwork"

cd backend
cp .env.example .env   # ใส่ JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, FIELD_ENCRYPTION_KEY
                       # และ DEMO_MODE=true (ได้ปุ่มเข้าสู่ระบบคลิกเดียว)
npm ci && npx prisma generate && npx prisma migrate deploy
npm run build && node dist/main.js     # เดโมสร้างข้อมูลเองตอนเปิดครั้งแรก

cd ../web && npm ci && npx vite --port 5173
# http://localhost:5173/login?as=hr&lang=th   (as=employee | manager | hr)
```

## ถ่ายภาพหน้าจอใหม่

ใช้สคริปต์ของ repo เท่านั้น (`docs/screenshots/capture.mjs`, `capture-mobile.mjs`,
`docs/social-preview/build.mjs`) กับฐานข้อมูล `db:seed` ใหม่ ไม่ใช่เดโม
เพราะต้องเข้าสู่ระบบด้วยรหัสผ่านและ 2FA

- ปักนาฬิกาเป็นเช้าวันทำงาน (เช่น 08:37 น.) ตามวิธีใน `docs/film/film.mjs`
  ทั้ง Postgres, seed และ API ใช้ offset เดียวกัน และรัน `docs/film/pin-clock.sql`
  ก่อน seed ถ้าไม่ปัก ภาพหน้าแรกของแอปจะขึ้นว่าพนักงานมาสาย
- Node ต้องมี `NODE_USE_ENV_PROXY=1` และ `NODE_EXTRA_CA_CERTS` ถึงจะโหลดฟอนต์ผ่าน proxy ได้
  (`capture.mjs` ไม่ยอมถ่ายถ้าฟอนต์ IBM Plex Sans Thai ไม่โหลด)
- ต้องมี `ffmpeg` ที่มี libwebp และ Flutter สำหรับภาพแอป
- สคริปต์ import `playwright` จากตำแหน่งของไฟล์ ถ้าไม่ได้ติดตั้งในโปรเจกต์
  ให้ทำ symlink `node_modules/playwright` ชั่วคราวที่ root แล้วลบทิ้งหลังถ่าย

## งานต่อไป: CW-063

รายการงาน UX ที่เหลือจากรอบนี้ย้ายไปอยู่ที่
[CW-063 (#64)](https://github.com/SuruchBoss/Cwork/issues/64) และ `docs/backlog.md`
แล้ว ให้ดูและติ๊กที่นั่นที่เดียว เอกสารนี้ไม่เก็บรายการซ้ำ เพื่อไม่ให้มีสองรายการที่ค่อยๆ ไม่ตรงกัน

- **ทำข้อ 1 ก่อน:** เปิดแอปบนมือถือจริง ดูสีสถานะและปุ่มลงเวลาออกใหม่ ทั้งธีมสว่างและธีมมืด
  ทำตอนติดตั้ง APK แรกของ CW-060 และต้องเสร็จก่อน pilot เริ่มใช้งาน (31 ต.ค. 2026)
- **เดือนในหน้าเงินเดือนของเว็บ (ข้อ 7):** ใช้ formatter ของ CW-058 ซึ่งแสดงปีเป็น พ.ศ.
  ห้ามสร้าง formatter ใหม่ ถ้า CW-058 ยังไม่เสร็จ ให้รอ
  `Fmt.period` ของแอปมือถือที่เพิ่มในรอบนี้ยังแสดงปี ค.ศ. ("สิงหาคม 2026")
  และ CW-058 จะเปลี่ยนเป็น พ.ศ. ("สิงหาคม 2569")

## ข้อควรระวังสำหรับคนทำต่อ

- ข้อความทุกอันต้องผ่าน `t()` (web) หรือ `ref.tr()` (mobile) โดยใช้ข้อความภาษาอังกฤษเป็น key
  แล้วเพิ่มคำแปลไทยใน `web/src/lib/i18n/messages.th.ts` / `mobile/lib/core/i18n/messages_th.dart`
  ถ้าลืมจะแสดงภาษาอังกฤษบนหน้าไทยโดยไม่มี error (ฝั่ง web มี test กันไว้เฉพาะ `labels.ts`)
- สีบน web อยู่ที่ token ใน `web/src/styles/theme.css` เท่านั้น ห้ามใส่ hex ใน component
  ฝั่งมือถือใช้สีของ `StatusColors` / `ClockOutColors` ชุดเดียวกัน
- อย่ารัน `prettier --write` ทั้งไฟล์ที่ไม่ได้แก้ repo นี้ไม่ได้ format ด้วย prettier ทั้งหมด
  การรันจะดึงบรรทัดที่ไม่เกี่ยวเข้ามาใน diff
- `flutter analyze` ต้องสะอาดทั้งหมด รวม info (CI ใช้ `--fatal-infos`)
  และต้อง `dart format --line-length 100`
- หนึ่ง commit ต่อหนึ่งเรื่อง, conventional commits, และเพิ่ม `CHANGELOG.md` ใต้ `[Unreleased]`
  เมื่อผู้ใช้มองเห็นการเปลี่ยนแปลง (ดู `CONTRIBUTING.md`)
