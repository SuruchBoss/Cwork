# Draft: telling Cwork as a story (2026-10-18)

Status: **draft for the owner to read. Nothing here is on the landing page or
README yet.** Once the owner confirms the wording in the PO room, it goes into
`landing/index.html` (with English in `landing/build-en.mjs`) and the top of
`README.th.md` / `README.md`. Layout and design do not change (the redesign is
CW-094, after the Pilot A install); only the words do.

Rules this draft keeps:
- Only what the product does today. No customer quotes, no results from a pilot,
  no company names, no numbers of hours saved (nothing has measured them).
- Edition wording as the owner typed it: "currently in the free edition"; online
  filing and bank files are planned for Pro; the accountant export is free. No
  "free forever".
- No Asuna image anywhere public.

---

## 1. Landing page (Thai), top to bottom

### Hero: two options, the PO recommends A

**A (recommended)**

> **สิ้นเดือน ให้เป็นแค่อีกวันทำงาน**
>
> ไฟล์จากเครื่องสแกนนิ้ว การลาที่จดไว้ในแชต เงินเดือนที่ต้องนับเป็นแบงก์ และไฟล์ที่นักบัญชีรอ
> Cwork รวมไว้ในที่เดียว HR ตรวจ อีกคนอนุมัติ แล้วพิมพ์สลิปกับใบรับเงินได้เลย
> ติดตั้งบนเครื่องของบริษัทคุณเอง ไม่มีค่ารายหัว

Why A: it names the day the buyer dreads (month end), not the software. Every
noun in the second line is a real feature today (scanner import, leave recorded
by HR, cash sheet, accountant export, two-person payroll, payslips and receipt
sheet).

**B**

> **ให้ HR ได้กลับบ้านตรงเวลา แม้ในวันปิดงวด**
>
> (same second paragraph)

Why not B first: "home on time" is a promise about hours that nothing has
measured yet. A says the same thing without a number to defend.

The buttons ("ลองใช้ทันที", "ติดตั้งเอง") and the note under them stay as they are.

### "ใหม่สำหรับออฟฟิศเล็ก" section: the before and after

Section intro (replaces the current paragraph that starts "สำหรับออฟฟิศเล็กที่ไม่มีฝ่าย IT"):

> **ออฟฟิศที่ HR หนึ่งคนดูแลทุกอย่าง**
>
> พนักงานสแกนนิ้วเข้างาน วันจ่ายเงินเดือนถอนเงินสดมาใส่ซอง และสำนักงานบัญชีข้างนอกยื่นภาษีให้
> ถ้าออฟฟิศคุณเป็นแบบนี้ สี่ฉากด้านล่างคือวันสิ้นเดือนที่ Cwork ทำให้
> ตอนนี้ทุกข้ออยู่ในรุ่นฟรี ทดสอบด้วยข้อมูลสังเคราะห์ และยังไม่มีบริษัทไหนใช้งานจริง

The last sentence keeps the honesty line the page already has.

The four cards, each "before" then "after" in the card's existing title and body:

1. **ไม่ต้องนั่งไล่เวลาทีละแถวใน Excel**
   ยกไฟล์ที่เครื่องสแกนส่งออกมาอัปโหลดได้เลย วันไหนสแกนครั้งเดียวหรือหลายครั้งเกิน
   Cwork ไม่เดาให้ HR เห็นเวลาดิบทุกตัวแล้วเลือกเอง วันในงวดที่จ่ายแล้วแก้ย้อนหลังไม่ได้
2. **วันจ่ายเงินสด รู้ก่อนไปธนาคารว่าต้องถอนแบงก์อะไรกี่ใบ**
   ใบเตรียมเงินสดบอกแบงก์และเหรียญของแต่ละคนลงถึง 25 สตางค์ พร้อมสลิปเงินเดือน
   และใบรับเงินให้พนักงานเซ็น
3. **นักบัญชีได้ไฟล์เดียว ไม่ต้องรอรวมจากหลายที่**
   ส่งออกพร้อมเลขผู้เสียภาษีสำหรับคนที่เตรียม ภ.ง.ด.1 และเทียบกับยอดที่ยื่นไปแล้ว
   ต่างแม้ 1 สตางค์ก็เห็น ระบบช่วยเตรียมและช่วยตรวจ ไม่ได้ยื่นแบบแทนนักบัญชี
4. **ลองคู่กับวิธีเดิมก่อน ไม่ต้องเชื่อจนกว่าตัวเลขตรง**
   รันเงินเดือนงวดเดียวกันใน Cwork เทียบกับตัวเลขที่ HR คิดเอง ระบบชี้ทุกคนและทุกช่องที่ต่าง
   ยังไม่ต้องจ่ายใครจริง

### "หกปัญหา" section heading

Current: "หกปัญหางาน HR ที่ธุรกิจไทยจ่ายแพงทุกเดือน". Proposed:

> **หกเรื่องที่ทำให้งาน HR ไม่จบในวันเดียว**

The six panels below keep their feature detail; the PO suggests only the heading
changes in this round, so the page tells one story from top to bottom without a
rewrite of every panel.

---

## 2. README opening (Thai)

Replaces only the two lines under `# Cwork`. Everything after (badges, demo link,
film, install, licence, editions) stays where it is, in the same order.

> **สิ้นเดือนให้เป็นแค่อีกวันทำงาน สำหรับออฟฟิศที่ HR หนึ่งคนดูแลทุกอย่าง**
>
> นำเข้าไฟล์จากเครื่องสแกนนิ้ว บันทึกการลา คำนวณเงินเดือนตามกฎหมายไทยโดยคนหนึ่งทำอีกคนอนุมัติ
> พิมพ์สลิป ใบรับเงิน และใบเตรียมเงินสด แล้วส่งไฟล์ให้นักบัญชีได้ในไฟล์เดียว
> ระบบ HR แบบโอเพนซอร์ส ติดตั้งบนเซิร์ฟเวอร์ของบริษัทคุณเอง ไม่มีค่ารายหัว

English (README.md), same place:

> **Month end as just another working day, for the office where one person does all of HR.**
>
> Import the fingerprint scanner's file, record leave, run payroll under Thai law
> with one person calculating and another approving, print payslips, receipt
> sheets and the cash sheet, and hand the accountant one file. Open-source HR you
> install on your own server, with no per-employee fee.

---

## 3. One post (the owner posts it)

> สิ้นเดือนของ HR ในออฟฟิศเล็ก ๆ มักหน้าตาแบบนี้
> เปิดไฟล์จากเครื่องสแกนนิ้วไล่ดูทีละแถว เลื่อนหาใบลาในแชต คิดเงินเดือนใน Excel
> นับแบงก์ใส่ซอง แล้วรวมไฟล์ส่งสำนักงานบัญชีอีกรอบ
>
> ผมทำ Cwork ขึ้นมาให้วันนั้นเป็นแค่อีกวันทำงาน
> อัปโหลดไฟล์จากเครื่องสแกนนิ้วได้ตรง ๆ วันที่เวลาไม่ชัด HR เห็นเวลาดิบแล้วเลือกเอง
> เงินเดือนคนหนึ่งคิด อีกคนอนุมัติ พิมพ์สลิป ใบรับเงิน และใบบอกว่าต้องถอนแบงก์อะไรกี่ใบ
> ส่วนนักบัญชีได้ไฟล์เดียวพร้อมเทียบกับยอดที่ยื่นไปแล้ว
>
> ติดตั้งบนเครื่องของบริษัทเอง ไม่มีค่ารายหัว และอยากลองก่อนก็รันคู่กับวิธีเดิมได้
> ยังไม่มีบริษัทไหนใช้งานจริง ถ้าออฟฟิศคุณเป็นแบบนี้และอยากลอง ทักมาคุยได้
>
> ลองในเบราว์เซอร์ (เข้าเป็น HR ของบริษัทตัวอย่าง ไม่ต้องสมัคร): https://cwork-demo.onrender.com/login?as=hr&lang=th
> รายละเอียด: https://suruchboss.github.io/Cwork/

Notes for the owner:
- The post says "ผม" because it is the owner's own voice; change it if you write
  differently.
- The demo can take about a minute to wake on the free Render plan; worth saying
  in a comment if someone asks.
- If you post before the demo timing is re-checked, the post is still true; the
  demo is the part that might be slow.

---

## What the owner decides

1. Hero A or B (or other words).
2. Whether the six-panel heading changes now or waits for CW-094.
3. The post as is, or edited.

Typing the chosen wording in the PO room is the go-ahead; the PO room then puts
it into the landing page, the English build map and both READMEs in one PR.
