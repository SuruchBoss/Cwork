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
  จึงยังไม่ได้เปิดแอปดูสีใหม่ ควรตรวจด้วย `docs/screenshots/capture-mobile.mjs`
  (ต้องใช้ `db:seed` และ `SEED_PASSWORD`) หรือบนเครื่องจริง ทั้งธีมสว่างและมืด
- **ภาพหน้าจอใน README และหน้า landing ยังเป็นของเดิม** — ต้องรัน
  `docs/screenshots/capture.mjs` และ `capture-mobile.mjs` ใหม่
- ฟอนต์ IBM Plex Sans Thai โหลดจาก Google Fonts ซึ่งเครื่องทดสอบเข้าไม่ได้
  ภาพที่ถ่ายจึงใช้ฟอนต์สำรอง ขนาดตัวอักษรที่ปรับไว้ควรดูอีกครั้งด้วยฟอนต์จริง
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

## งานที่แนะนำให้ทำต่อ (เรียงตามผลต่อผู้ใช้)

1. **ตารางบนมือถือเป็นการ์ด** — ตอนนี้ตารางบนจอแคบเลื่อนซ้ายขวาได้ (`white-space: nowrap`
   ใน `app.css`) อ่านได้แต่ไม่สะดวก หน้าที่ใช้บ่อยที่สุด (ทะเบียนพนักงาน, การลา, รออนุมัติ)
   ควรแสดงเป็นรายการการ์ดทีละคนเมื่อจอกว้างไม่ถึง 640px
2. **หน้าประเมินผล/KPI ว่างใต้ตัวเลข** — ควรมี empty state บอกว่าขั้นต่อไปคืออะไร
   และปุ่มไปทำ
3. **ตารางเวร** — วันหยุดควรมีพื้นสีอ่อนให้แยกออกจากวันทำงานได้ทันที และหัวคอลัมน์วันนี้ควรเน้น
4. **แถวในตารางกดได้** — หลายตาราง (แดชบอร์ด, การลา) ยังต้องหาปุ่ม "เปิดดู" หรือ "ดูทั้งหมด"
   ถ้าทั้งแถวกดได้จะง่ายขึ้น (ต้องระวังเรื่อง keyboard/screen reader)
5. **หน้าเงินเดือน** — คอลัมน์ "รอบคำนวณ" เป็นศัพท์ระบบ และงวดแสดงเป็น `2026-08`
   ควรใช้ชื่อเดือนแบบเดียวกับแอปมือถือ (`Fmt.period`)
6. **Benefit plan code** (`HEALTH_GROUP`) ใต้ชื่อแผนเป็นตัว mono ใช้ได้สำหรับ HR
   แต่อาจซ่อนไว้ในรายละเอียดแทน

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
