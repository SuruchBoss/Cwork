// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Builds landing/en/index.html from landing/index.html.
 *
 * The English page is the same page, not a second one: same markup, same CSS,
 * same screenshots. Hand-maintaining two nine-hundred-line files guarantees
 * they drift, and the first thing to drift would be a fix applied to one and
 * not the other. So the translation lives here as data, and the page is
 * generated.
 *
 *     node landing/build-en.mjs
 *
 * Every Thai string in the source must have an entry below. One that does not
 * fails the build rather than shipping a half-translated page.
 *
 * The console screenshots come in two takes, one per interface language
 * (docs/screenshots/capture.mjs), so the English page shows the English
 * console: every `.th.webp` becomes `.en.webp`, and a take that is missing
 * fails the build rather than falling back to Thai. The employee-app shots
 * are Thai only, which their descriptions say.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// U+0E3F ฿ is in the Thai block but is a currency symbol, not script: it reads
// the same on either page, so it must not count as something left untranslated.
const THAI = /[\u0E01-\u0E3E\u0E40-\u0E7F]/;

/** Thai source → English. Longest first, so a substring never eats its parent. */
const COPY = {
  // --------------------------------------------------------------- nav
  'ปัญหาที่เราแก้': 'Problems we solve',
  'คิดค่าใช้จ่าย': 'What it costs',
  'หน้าตาระบบ': 'The screens',
  'สำหรับฝ่าย IT': 'For IT',
  'ดาวน์โหลดฟรี': 'Download free',
  // -------------------------------------------------------------- hero
  'ใช้งานได้แล้ว · v0.3.1': 'Working today · v0.3.1',
  'งาน HR ทั้งบริษัท': 'All of HR, company-wide',
  'ไม่ต้องจ่าย': 'with no ',
  'รายหัว': 'per-seat fee',
  'เงินเดือนตามกฎหมายไทย ลงเวลาที่โกงยาก อนุมัติได้จากมือถือ และข้อมูลพนักงานที่ปลอดภัยตาม PDPA — ครบในระบบเดียว ติดตั้งบนเซิร์ฟเวอร์ของบริษัทคุณ จ่ายแค่ค่าเครื่อง ไม่มีค่ารายหัว ไม่มีสัญญารายปี':
    'Payroll to Thai law, attendance that is hard to fake, approvals from a phone, and employee data kept safe under PDPA — in one system, installed on your own server. You pay for the machine and nothing else: no charge per employee, no annual contract.',
  'ดูว่าประหยัดได้เท่าไหร่': 'See what you would save',
  'ดูปัญหาที่เราแก้': 'See the problems we solve',
  'ฝ่าย IT ติดตั้งเองได้ด้วย Docker สามคำสั่ง —':
    'Your IT team installs it with three Docker commands —',
  'ส่งขั้นตอนให้เขา': 'send them the steps',
  // -------------------------------------------------------- spec sheet
  'ค่าลิขสิทธิ์': 'Licence',
  'ค่ารายหัว ต่อเดือน': 'Per seat, per month',
  'เซิร์ฟเวอร์ที่ต้องมี': 'Servers needed',
  'ประเภทคำขอในระบบอนุมัติ': 'Request types in one approval flow',
  'ภาษา ทั้งเว็บและแอป': 'Languages, web and app',
  'สัญญาอนุญาต': 'Licence terms',
  // ------------------------------------------------------- walkthrough
  'ระบบจริงที่รันอยู่ ไม่ใช่ภาพจำลอง': 'The running product, not a mock-up',
  // ---------------------------------------------------------- problems
  'ปัญหาและทางแก้': 'Problems and fixes',
  'หกปัญหางาน HR ที่ธุรกิจไทยจ่ายแพงทุกเดือน':
    'Six HR problems Thai businesses pay for every month',
  'ไม่มีข้อไหนที่แก้จบด้วยฟีเจอร์เดียว — แต่ละปัญหา Cwork ใช้หลายส่วนของระบบทำงานประสานกัน เพื่อปิดช่องโหว่ให้จบจริง ไม่ใช่แค่ย้ายปัญหาไปไว้ที่อื่น':
    'None of them is fixed by a single feature. For each one, several parts of Cwork work together to close the gap for good — not just move the problem somewhere else.',
  'ค่าระบบโตตามจำนวนคน': 'An HR bill that grows with headcount',
  'เงินเดือนผิด ต้องลุ้นทุกงวด': 'Payroll you hold your breath over',
  'ลงเวลาแทนกัน หน้างานไม่มีสัญญาณ': 'Buddy punching, and sites with no signal',
  'คำขอค้าง รอลายเซ็น': 'Requests stuck waiting for a signature',
  'ข้อมูลพนักงานรั่ว เสี่ยง PDPA': 'Employee data leaks, and PDPA exposure',
  'ระบบหลายตัวที่ไม่คุยกัน': 'Systems that do not talk to each other',
  // ----------------------------------------------------------- 01 cost
  'ค่าใช้จ่าย': 'Cost',
  'ค่าระบบ HR โตตามจำนวนพนักงาน': 'Your HR bill grows with every hire',
  'ระบบ HR ส่วนใหญ่คิดเงินรายหัวทุกเดือน รับคนเพิ่มเมื่อไรบิลก็เพิ่มตาม ผูกสัญญารายปี และข้อมูลพนักงานทั้งหมดไปอยู่บนเซิร์ฟเวอร์ของผู้ให้บริการ':
    'Most HR systems charge per employee per month: every hire raises the bill, the contract renews yearly, and all your employee data lives on the vendor’s servers.',
  'วิธีที่ Cwork แก้': 'How Cwork fixes it',
  'ไม่มีค่าลิขสิทธิ์ ไม่มีค่ารายหัว': 'No licence fee, no per-seat fee',
  'โอเพนซอร์ส Apache-2.0 พนักงาน 20 หรือ 2,000 คนก็ราคาเดียว คือค่าเซิร์ฟเวอร์':
    'Open source under Apache-2.0. Twenty employees or two thousand cost the same: the server.',
  'เครื่องเดียวจบ ไม่ต้องมีทีม DevOps': 'One machine, no DevOps team',
  'Docker สามคำสั่ง ใช้ PostgreSQL ตัวเดียวทำงานแทนคิว แคช และระบบล็อก ไม่ต้องมี Redis หรือ Kafka':
    'Three Docker commands. PostgreSQL alone does the work of a queue, a cache and a lock service — no Redis, no Kafka.',
  'ข้อมูลเป็นของคุณ': 'Your data stays yours',
  'อยู่ในฐานข้อมูลของบริษัทเอง สำรอง ย้าย หรือเลิกใช้เมื่อไรก็ได้ ไม่มีใครล็อกคุณไว้':
    'It lives in your company’s own database. Back it up, move it, or stop using Cwork whenever you like — nobody locks you in.',
  'ขยายได้เมื่อบริษัทโต': 'Room to grow',
  'เพิ่มเครื่อง API เป็นหลายเครื่องได้ด้วยการตั้งค่าเดียว':
    'Run the API on several machines by changing one setting.',
  // -------------------------------------------------------- calculator
  'ปีหนึ่งคุณจ่ายค่าระบบ HR ไปเท่าไหร่': 'What does your HR system cost you a year?',
  'พนักงานในระบบ': 'Employees in the system',
  'คน': 'people',
  'ค่าระบบที่จ่ายอยู่ ต่อคนต่อเดือน': 'What you pay now, per person per month',
  'ใส่ราคาที่คุณจ่ายอยู่จริง ตัวเลขที่ใส่ไว้เป็นแค่ตัวอย่าง':
    'Use the price you actually pay — the number filled in is only an example.',
  'ค่าเซิร์ฟเวอร์ที่จะใช้รัน Cwork ต่อเดือน': 'What a server to run Cwork would cost, per month',
  'VPS ขนาดเล็กก็พอสำหรับบริษัทหลักร้อยคน ถ้ามีเซิร์ฟเวอร์อยู่แล้วใส่ 0':
    'A small VPS is enough for a company of a few hundred. Enter 0 if you already have a server.',
  'ประหยัดได้ปีละ': 'You would save, per year',
  'ระบบเดิม ·': 'Your system now ·',
  'คน × ฿': 'people × ฿',
  '× 12 เดือน': '× 12 months',
  'Cwork · ค่าลิขสิทธิ์': 'Cwork · licence',
  'Cwork · ค่าเซิร์ฟเวอร์ปีละ': 'Cwork · server, per year',
  // -------------------------------------------------------- 02 payroll
  'เงินเดือน': 'Payroll',
  'ปิดงวดเงินเดือนแบบลุ้นทุกเดือน': 'Closing payroll should not be a gamble',
  'สูตร Excel ที่มีคนเดียวเข้าใจ ภาษีขั้นบันได ประกันสังคม และโอทีหลายอัตรา — ผิดครั้งเดียวเสียทั้งเงิน เสียเวลาแก้ และเสียความเชื่อใจของพนักงาน':
    'A spreadsheet only one person understands, progressive tax, social security and several overtime rates — one mistake costs money, time to fix, and your employees’ trust.',
  'คำนวณตามกฎหมายไทย': 'Computed to Thai law',
  'ภาษีหัก ณ ที่จ่ายแบบขั้นบันได ประกันสังคม กองทุนสำรองเลี้ยงชีพ และโอทีตาม พ.ร.บ. คุ้มครองแรงงาน':
    'Progressive withholding tax, social security, provident fund, and overtime rates from the Labour Protection Act.',
  'คนทำไม่ใช่คนอนุมัติ': 'Who prepares cannot approve',
  'เจ้าหน้าที่เตรียมรอบ ผู้จัดการ HR เป็นคนอนุมัติ ระบบบังคับไว้เอง ไม่ใช่แค่นโยบายบนกระดาษ':
    'A payroll officer prepares the run and an HR manager approves it. The system enforces it — not a policy on paper.',
  'ยอดไม่ลงตัว ไม่ให้ส่งออก': 'No export until the figures reconcile',
  'ทุกรอบในงวดต้องอนุมัติแล้ว และยอดสลิปรวมต้องตรงกับยอดรอบทุกบาท ระบบจึงยอมออกไฟล์ให้':
    'Every run in the period must be approved and the payslips must add up to the run totals, to the baht, before a file can leave.',
  'ผู้อนุมัติเห็นว่าทำไมยอดขยับ': 'Approvers see why the total moved',
  'ผู้ช่วย AI สรุปความต่างจากงวดก่อน — คนเข้า-ออก โอที ลาไม่รับค่าจ้าง — โดยห้ามแต่งตัวเลขที่ไม่มีในข้อมูล เปิดใช้เมื่อต้องการ':
    'The AI assistant explains the change from last period — joiners and leavers, overtime, unpaid leave — and is not allowed to state a figure the data does not contain. Switched on only if you want it.',
  'สลิปที่อธิบายได้แม้ผ่านไปเป็นปี': 'Payslips you can explain a year later',
  'แยกเงินสมทบฝั่งนายจ้างออกจากยอดที่หักพนักงาน และพนักงานเปิดดูสลิปเองได้ในแอป':
    'Employer contributions shown apart from what was deducted, and employees open their own payslips in the app.',
  'กำลังพัฒนา': 'In progress',
  'ไฟล์ยื่น ภ.ง.ด.1 ประกันสังคม และไฟล์โอนเงินธนาคาร':
    'PND 1 and social-security filing files, and bank transfer files',
  'รอบที่ปิดแล้ว — รายได้รวม รายการหัก ยอดสุทธิ และต้นทุนนายจ้าง':
    'A closed run — gross pay, deductions, net pay and employer cost',
  // ----------------------------------------------------- 03 attendance
  'ลงเวลาทำงาน': 'Attendance',
  'ลงเวลาแทนกัน และหน้างานที่ไม่มีสัญญาณ': 'Buddy punching, and sites with no signal',
  'เพื่อนกดแทนกัน พิกัดปลอม หรือพนักงานหน้างานที่เน็ตหลุดจนลงเวลาไม่ได้ — สุดท้าย HR ต้องมานั่งไล่เช็คทีละคนตอนปิดงวด':
    'A friend clocks in for you, a location is faked, or a site worker loses signal and cannot clock in at all — and at month-end HR checks it all by hand.',
  'ผูกบัญชีกับเครื่อง': 'Accounts bound to a device',
  'เครื่องแรกที่ใช้ลงเวลาผูกกับพนักงานคนนั้น ลงเวลาจากเครื่องอื่นจะถูกติดธงให้ตรวจ การย้ายเครื่องต้องผ่าน HR และมีบันทึก':
    'The first phone an employee clocks in from is bound to them. A punch from any other device is flagged for review; moving the binding goes through HR and is audited.',
  'ติดธงให้ตรวจ ไม่ใช่ปฏิเสธ': 'Flag for review, never refuse',
  'ลงเวลานอกพื้นที่หรือพิกัดดูผิดปกติ ระบบรับไว้พร้อมธง คนที่มาทำงานจริงต้องลงเวลาได้เสมอ':
    'A punch outside the fence or with a suspicious location is accepted with a flag. Someone who turned up to work can always clock in.',
  'ออฟไลน์ก็ลงเวลาได้อย่างปลอดภัย': 'Offline punches, kept safe',
  'เก็บไว้ในพื้นที่เข้ารหัสของเครื่อง ส่งเองเมื่อกลับมาออนไลน์ ตรวจจับเครื่องที่ถูกเจาะระบบ และรายการที่ส่งช้าเกินต้องยืนยันก่อนนับ':
    'Held in the phone’s encrypted storage and sent on reconnect. Rooted or jailbroken devices are detected, and a punch delivered too late needs confirming before it counts.',
  'ตารางกะที่ระบบใช้คิดมาสายจริง': 'Shifts that lateness is really measured against',
  'กำหนดกะและตารางเวร มอบหมายทั้งแผนกได้ในครั้งเดียว':
    'Define shifts and rosters, and assign a whole department in one go.',
  'หัวหน้าอ่านสรุป ไม่ต้องไล่ธงทีละรายการ': 'Managers read a summary, not a list of flags',
  'ผู้ช่วย AI จัดกลุ่มรายการผิดปกติตามสถานที่ บอกได้ว่าเป็นรั้วพื้นที่ที่ตั้งแคบไป หรือเรื่องที่ควรถามจริง':
    'The AI assistant groups flagged punches by location, so a fence drawn too tight reads differently from something worth asking about.',
  'ตารางกะและเวร — ค่าที่ตั้งตรงนี้คือสิ่งที่ระบบใช้คิดการมาสาย':
    'Shifts and roster — what you set here is what lateness is measured against',
  // ------------------------------------------------------ 04 approvals
  'การอนุมัติ': 'Approvals',
  'คำขอค้าง เพราะรอลายเซ็น': 'Requests stuck waiting for a signature',
  'ใบลาอยู่ในแชต ใบเบิกเป็นกระดาษ หัวหน้าไม่อยู่ออฟฟิศ — เรื่องที่ควรจบในห้านาทีค้างเป็นสัปดาห์ และไม่มีใครรู้ว่าติดอยู่ที่ใคร':
    'Leave requests in a chat, expense claims on paper, a manager out of the office — five-minute decisions wait a week, and nobody knows whose desk they are on.',
  'ระบบอนุมัติชุดเดียว เก้าเรื่อง': 'One approval engine, nine request types',
  'ลา โอที เบิกค่าใช้จ่าย แก้เวลา ลาออก ขออัตรากำลัง ใบเสนอจ้าง รอบเงินเดือน และขอเอกสาร':
    'Leave, overtime, expenses, attendance corrections, resignations, headcount requests, offers, payroll runs and document requests.',
  'เส้นทางตามโครงสร้างจริง': 'Routes that follow your organisation',
  'ส่งหาหัวหน้าสายงาน หัวหน้าแผนก บทบาท หรือตัวบุคคล ตั้งเงื่อนไขวงเงิน และมอบอำนาจแทนได้':
    'Send to the line manager, the department head, a role or a named person, with amount thresholds and delegation.',
  'อนุมัติจากมือถือ พร้อมแจ้งเตือน': 'Approve from a phone, with notifications',
  'อีเมลและ push แจ้งทันที ถ้าส่งไม่สำเร็จระบบลองส่งใหม่ให้เอง':
    'Email and push go out at once, and a failed delivery is retried automatically.',
  'วันลาไม่มีวันติดลบ': 'Leave balances never go negative',
  'ยื่นปุ๊บกันวันไว้ทันที สองคำขอจึงแย่งวันเดียวกันไม่ได้ และไม่นับเสาร์-อาทิตย์หรือวันหยุดนักขัตฤกษ์':
    'Days are reserved the moment a request is filed, so two requests cannot claim the same day — and weekends and public holidays are never counted.',
  'หนังสือรับรองแบบบริการตัวเอง': 'Self-service certificates',
  'พนักงานขอเอง อนุมัติแล้วออกเป็น PDF พร้อมรหัสตรวจสอบว่าเป็นของจริง':
    'Employees request them; once approved they are issued as PDFs with a code that proves they are genuine.',
  'กล่องรออนุมัติ — ทุกเรื่องที่รอคุณ อยู่ในที่เดียว':
    'The approvals inbox — everything waiting on you, in one place',
  // ----------------------------------------------------------- 05 PDPA
  'PDPA และความปลอดภัย': 'PDPA and security',
  'ข้อมูลพนักงานรั่ว คือความเสี่ยงตาม PDPA': 'An employee data leak is a PDPA liability',
  'เลขบัตรประชาชน เลขบัญชี และเงินเดือน คือข้อมูลที่อ่อนไหวที่สุดในบริษัท แต่มักอยู่ใน Excel ที่ส่งต่อกันทางอีเมล — PDPA กำหนดโทษปรับทางปกครองได้สูงสุดห้าล้านบาท':
    'National ID numbers, bank accounts and salaries are the most sensitive data a company holds — and they usually live in spreadsheets passed around by email. PDPA administrative fines go up to five million baht.',
  'เข้ารหัสข้อมูลอ่อนไหว': 'Sensitive fields encrypted',
  'เลขบัตรประชาชนและเลขบัญชีเข้ารหัสในฐานข้อมูล หน้าจอแสดงแค่สี่หลักท้าย':
    'National IDs and bank account numbers are encrypted in the database; screens show only the last four digits.',
  'รหัสผ่านอย่างเดียวเข้าไม่ได้': 'A password alone is not enough',
  'บัญชีที่เข้าถึงข้อมูลอ่อนไหวหรือทำเงินเดือนได้ ต้องยืนยันตัวตนสองขั้นตอน':
    'Accounts that can reach sensitive data or run payroll must use two-factor authentication.',
  'ประวัติที่แก้ไม่ได้แม้แต่ผู้ดูแล': 'History even an administrator cannot rewrite',
  'บันทึกการใช้งานเขียนเพิ่มได้อย่างเดียว ฐานข้อมูลเป็นผู้บังคับ ไม่ใช่โค้ดของแอป':
    'The audit log is append-only, enforced by the database rather than by application code.',
  'เก็บเท่าที่จำเป็น': 'Keep only what you need',
  'ขอความยินยอมตั้งแต่ใบสมัคร ลบข้อมูลผู้สมัครที่ไม่ได้รับเข้าทำงานใน 12 เดือน และลบข้อมูลระบุตัวตนของคนที่ลาออกเกินระยะเก็บ':
    'Consent is asked on the application form, unsuccessful candidates are erased after 12 months, and leavers past the retention period have their identifying data removed.',
  'ไม่หลุดไปกับ log': 'Nothing leaks through the logs',
  'log ของระบบไม่มีเงินเดือน เลขบัตร เลขบัญชี หรือรหัสผ่าน และมีชุดทดสอบพิสูจน์ทุกครั้งที่แก้โค้ด':
    'System logs carry no salary, national ID, bank account or password — and a test proves it on every change.',
  'สแกนไฟล์ก่อนเก็บ': 'Files scanned before they are kept',
  'ไฟล์ที่อัปโหลดเข้ามาถูกส่งไปสแกนมัลแวร์ก่อนเสมอ':
    'Every upload is sent for a malware scan first.',
  'อ่านเอกสารข้อมูลส่วนบุคคลฉบับเต็ม →': 'Read the full data protection document →',
  'บันทึกการใช้งาน — ใครทำอะไรเมื่อไร แก้ย้อนหลังไม่ได้':
    'The audit log — who did what, and when, and none of it can be edited',
  // ------------------------------------------------------ 06 lifecycle
  'วงจรชีวิตพนักงาน': 'The employee lifecycle',
  'สรรหาอยู่ในอีเมล ทะเบียนพนักงานอยู่ใน Excel ประเมินผลอยู่ในสเปรดชีตอีกไฟล์ — ข้อมูลเดียวกันถูกพิมพ์ซ้ำหลายรอบ และไม่มีที่ไหนถูกต้องที่สุด':
    'Hiring lives in email, the employee register in Excel, reviews in yet another spreadsheet — the same data typed three times, and none of it the single source of truth.',
  'สรรหาจนเป็นพนักงานในคลิกเดียว': 'From applicant to employee in one click',
  'คำขออัตรากำลัง หน้าประกาศงานสาธารณะ แบบทดสอบที่ตรวจอัตโนมัติ สัมภาษณ์พร้อมใบให้คะแนน และใบเสนอจ้างที่กลายเป็นพนักงานในระบบ':
    'Headcount requests, a public careers page, auto-graded assessments, interviews with scorecards, and an offer that becomes an employee record.',
  'ประเมินผลที่ยุติธรรมขึ้น': 'Fairer performance reviews',
  'KPI ถ่วงน้ำหนัก เช็คอินระหว่างรอบ และ HR ปรับเทียบเกรดทั้งองค์กร':
    'Weighted KPIs, mid-cycle check-ins, and organisation-wide grade calibration by HR.',
  'สวัสดิการที่ไหลเข้าเงินเดือนเอง': 'Benefits that flow into payroll',
  'ลงทะเบียนสวัสดิการแล้ว รอบเงินเดือนถัดไปคิดส่วนพนักงานและส่วนนายจ้างให้อัตโนมัติ':
    'Enrol an employee in a plan and the next payroll run computes the employee and employer shares by itself.',
  'ลาออกอย่างเป็นระบบ': 'Orderly offboarding',
  'เช็คลิสต์คืนทรัพย์สิน สัมภาษณ์ก่อนออก และประวัติการจ้างงานที่ครบถ้วน':
    'An asset-return checklist, an exit interview, and a complete employment history.',
  'สองภาษาทั้งระบบ': 'Two languages, throughout',
  'ไทยเป็นค่าเริ่มต้น สลับเป็นอังกฤษได้ทั้งเว็บและแอป สำหรับผู้บริหารหรือผู้ตรวจสอบที่ไม่อ่านไทย':
    'Thai by default, English at the flip of a switch — web and app — for directors and auditors who do not read Thai.',
  'ผู้สมัครงาน — ตั้งแต่ใบสมัครจนถึงใบเสนอจ้าง': 'Candidates — from application to offer',
  // ----------------------------------------------------------- screens
  'หน้าจอที่ฝ่ายบุคคลเปิดทุกวัน': 'The screens HR opens every day',
  'ภาพจากระบบจริงกับบริษัทตัวอย่าง ไทยเป็นค่าเริ่มต้น และสลับเป็นอังกฤษได้ทั้งระบบ':
    'Captured from the running product with the demo company, and shown here in English: Thai is the default, and one switch turns the whole interface English.',
  'แดชบอร์ด': 'Dashboard',
  'งานที่รอ พนักงาน และรอบเงินเดือนล่าสุดในหน้าเดียว':
    'Pending work, headcount and the latest payroll run on one page',
  'ทะเบียนพนักงาน': 'Employee register',
  'ค้นเจอทุกคนโดยไม่ต้องเปิด Excel': 'Find anyone without opening a spreadsheet',
  'การลา': 'Leave',
  'นับวันให้ตามปฏิทินวันหยุดของบริษัท': 'Days counted against your own holiday calendar',
  'ประวัติพนักงาน': 'Employee record',
  'ข้อมูลการจ้าง วันลาคงเหลือ และสายบังคับบัญชา':
    'Employment details, leave balances and reporting line',
  'ประเมินผล / KPI': 'Performance / KPIs',
  'น้ำหนักรวมต้องได้ 100 และ HR ปรับเทียบเกรด':
    'KPI weights must total 100, and HR calibrates the grade',
  'เวลาเข้า-ออก มาสาย และรายการที่ติดธงให้ตรวจ':
    'Clock-in and clock-out, lateness, and punches flagged for review',
  // --------------------------------------------------------------- app
  'แอปพนักงาน': 'Employee app',
  'ออกแบบมาสำหรับโทรศัพท์ที่สัญญาณหลุด': 'Built for phones that lose signal',
  'ไซต์ก่อสร้าง ห้องเย็น ชั้นใต้ดินของห้าง — ที่ที่พนักงานต้องลงเวลาจริง มักเป็นที่ที่เน็ตไม่มี':
    'Building sites, cold stores, the basement of a mall — the places people really clock in are often the places with no signal.',
  'ลงเวลาตอนออฟไลน์ได้': 'Clock in while offline',
  'รายการที่ยังส่งไม่ได้ถูกเก็บแบบเข้ารหัสไว้ในเครื่อง แล้วส่งให้เองเมื่อกลับมาออนไลน์':
    'A punch that cannot be sent yet is kept, encrypted, on the phone and sent when the connection returns.',
  'ส่งซ้ำไม่กลายเป็นลงเวลาสองครั้ง': 'A retry is never a second punch',
  'ทุกรายการมีรหัสประจำตัวที่เครื่องสร้างขึ้นเอง เซิร์ฟเวอร์จึงรู้ว่ารายการไหนซ้ำ':
    'Every punch carries an id the phone generates, so the server knows a duplicate when it sees one.',
  'ดูสลิป ขอลา และอนุมัติได้ในเครื่องเดียว': 'Payslips, leave and approvals in one app',
  'หัวหน้างานกดอนุมัติจากมือถือได้ ไม่ต้องรอกลับไปเปิดคอม':
    'Supervisors approve from their phones instead of waiting to get back to a desk.',
  // ------------------------------------------------------------- trust
  'ความน่าเชื่อถือ': 'Trust',
  'กฎที่ผู้ดูแลระบบก็แหกไม่ได้': 'Rules even an administrator cannot break',
  'นโยบายบนกระดาษข้ามได้เสมอ Cwork จึงเขียนกฎสำคัญไว้ในระบบ ให้ระบบเป็นคนปฏิเสธ':
    'A policy on paper can always be skipped, so Cwork writes the important rules into the system and lets the system say no.',
  'แก้ประวัติย้อนหลังไม่ได้': 'History cannot be rewritten',
  'ฐานข้อมูลปฏิเสธการแก้และการลบรายการเก่า แม้คำสั่งนั้นจะมาจากตัวระบบเอง ต่อให้มีคนเจาะเข้ามาได้ ก็ลบร่องรอยของตัวเองไม่ได้':
    'The database refuses to edit or delete past entries, even when the order comes from the application itself. An intruder can add rows, but cannot erase their tracks.',
  'คนเตรียมรอบเงินเดือน อนุมัติเองไม่ได้': 'Whoever prepares payroll cannot approve it',
  'เจ้าหน้าที่เงินเดือนเตรียมรอบ ผู้จัดการ HR เป็นคนอนุมัติ ระบบบังคับไว้เอง':
    'The payroll officer prepares the run, the HR manager approves it, and the system enforces the split.',
  'ใครที่อ่านเลขบัตรประชาชนได้ ทำเงินเดือนได้ หรือแจกสิทธิ์ให้คนอื่นได้ ต้องใส่รหัสจากแอปยืนยันตัวตน และรหัสหนึ่งตัวใช้ได้ครั้งเดียว':
    'Anyone who can read national IDs, run payroll or grant permissions must enter a code from an authenticator app — and each code works only once.',
  'สแกนไฟล์ก่อนเก็บเสมอ': 'Uploads are always scanned first',
  'เรซูเม่ที่คนนอกอัปโหลดคือไฟล์ที่ไว้ใจได้น้อยที่สุดในระบบ และสแกนเนอร์ที่ใช้งานไม่ได้ ไม่เคยแปลว่า “ผ่าน”':
    'A CV uploaded by a stranger is the least trustworthy file in the system, and a scanner that is down never counts as a pass.',
  'ระบบที่เพิ่งติดตั้ง ไม่ตกเป็นของคนที่เข้ามาก่อน':
    'A fresh install does not belong to whoever arrives first',
  'ผู้ดูแลคนแรกสร้างได้จากคำสั่งบนเซิร์ฟเวอร์ หรือหน้าเว็บที่ถือโทเคนใช้ครั้งเดียวซึ่งคำสั่งนั้นออกให้เท่านั้น':
    'The first administrator can only be created by a command on the server, or by a web page holding a one-time token that only that command can issue.',
  'ผู้ช่วย AI เห็นไม่เกินสิทธิ์ของคนที่ถาม': 'The AI assistant sees no more than the person asking',
  'ไม่มีคำถามไหนขยายสิทธิ์ได้ ต่อให้ถูกหลอกสำเร็จ ก็เห็นได้แค่ที่ผู้ถามเห็นอยู่แล้ว และปิดไว้เป็นค่าเริ่มต้น':
    'No question can widen what it is allowed to see: even a successful trick reveals only what the asker could already see. And it is off by default.',
  'ทดสอบทุกครั้งที่แก้โค้ด': 'Tested on every change',
  'กฎธุรกิจทุกข้อมี unit test และชุด end-to-end ที่ยิงผ่าน HTTP จริง รันใน CI ทุกครั้ง':
    'Every business rule has unit tests, and an end-to-end suite drives the real API over HTTP in CI on every push.',
  'แก้ช่องโหว่อย่างเปิดเผย': 'Vulnerabilities fixed in the open',
  'รับแจ้งผ่าน GitHub Security Advisory แก้ ออกเวอร์ชันใหม่ และประกาศให้รู้ทั่วกัน':
    'Reported through GitHub Security Advisories, fixed, released and announced.',
  'IT ดูแลง่าย': 'Easy for IT to run',
  'log แบบ JSON มาตรฐาน และ /metrics สำหรับ Prometheus บนพอร์ตที่ไม่เปิดสู่ภายนอก':
    'Standard JSON logs, and /metrics for Prometheus on a port that is never published.',
  'โค้ดเปิดทั้งหมด': 'All of the code is open',
  'ตรวจสอบได้ทุกบรรทัด ไม่มีส่วนที่ต้องเชื่อใจโดยไม่เห็น':
    'Every line can be inspected — there is nothing you have to trust without seeing.',
  // ----------------------------------------------------------- install
  'เครื่องเดียวจบ ไม่ต้องมีทีมดูแล': 'One machine, no team to run it',
  'ส่งหัวข้อนี้ให้คนที่ดูแลเซิร์ฟเวอร์ของบริษัทได้เลย สิ่งที่ต้องมีคือเครื่องหนึ่งเครื่องกับ Docker — ไม่ต้องมี Redis ไม่ต้องมี message broker ไม่ต้องมี Kubernetes':
    'Forward this section to whoever looks after your servers. All it needs is one machine with Docker — no Redis, no message broker, no Kubernetes.',
  'เตรียมเครื่องและความลับ': 'Prepare the machine and the secrets',
  'compose จะไม่ยอมเริ่มทำงานถ้ายังไม่ได้ตั้งคีย์พวกนี้':
    'Compose refuses to start until these keys are set.',
  '# คีย์เข้ารหัสข้อมูล': '# data encryption key',
  'เริ่มระบบ แล้วสร้างตารางฐานข้อมูล': 'Start the system, then create the database tables',
  'ขั้นนี้ยังไม่มีข้อมูลอะไรในระบบ': 'Nothing is in the system yet at this step.',
  'เลือกทางที่ต้องการ': 'Choose your path',
  'ลองดูก่อน': 'Try it first',
  '— โหลดบริษัทตัวอย่างที่มีพนักงาน 8 คน รอบเงินเดือนที่ปิดแล้ว ใบลาที่รออนุมัติ และผู้สมัครงานกลางขั้นตอน ทุกหน้ามีของให้ดู':
    '— load a demo company with 8 employees, a closed payroll run, leave waiting for approval and candidates mid-pipeline. Every page has something on it.',
  'ใช้งานจริง': 'For real',
  '— สร้างองค์กรของคุณเอง ผู้ดูแลหนึ่งบัญชี ไม่มีข้อมูลตัวอย่างให้ต้องตามลบ':
    '— create your own organisation and one administrator, with no sample data to clean out afterwards.',
  'เปิดใช้งาน': 'Open it',
  'เข้าที่': 'Go to',
  '— ผู้ดูแลคนแรกถือสิทธิ์ทั้งหมด ระบบจึงบังคับให้ตั้งการยืนยันตัวตนสองขั้นตอนก่อนเข้าใช้งานครั้งแรก เตรียมแอป Authenticator ไว้ด้วย':
    '— the first administrator holds every permission, so the system makes them set up two-factor authentication before first use. Have an authenticator app ready.',
  'เซิร์ฟเวอร์ของบริษัท': 'Your company’s server',
  'ชื่อองค์กร :': 'Organisation :',
  'บริษัท ตัวอย่าง จำกัด': 'Example Co., Ltd.',
  'เขตเวลา :': 'Time zone :',
  'อีเมลผู้ดูแล :': 'Admin email :',
  'รหัสผ่าน :': 'Password :',
  'องค์กร · 8 บทบาท · ผู้ดูแล 1 บัญชี': 'organisation · 8 roles · 1 administrator',
  'ไม่มีข้อมูลตัวอย่างให้ต้องตามลบ': 'no sample data to clean out',
  // ----------------------------------------------------------- closing
  'เริ่มต้น': 'Get started',
  'ลองกับบริษัทตัวอย่าง ภายในห้านาที': 'Try it with a demo company in five minutes',
  'ดาวน์โหลดฟรี ติดตั้งบนเครื่องของคุณ ทุกหน้ามีข้อมูลตัวอย่างให้กดลองจริง ตั้งแต่ใบลาจนถึงรอบเงินเดือนที่ปิดแล้ว':
    'Download it free and install it on your own machine. Every page comes with sample data to click through — from a leave request to a closed payroll run.',
  'ดาวน์โหลดฟรีบน GitHub': 'Download free on GitHub',
  'ดูขั้นตอนติดตั้ง': 'See the install steps',
  // ------------------------------------------------------------ footer
  'ระบบบริหารทรัพยากรบุคคลแบบโอเพนซอร์ส · Apache-2.0':
    'Open-source HR information system · Apache-2.0',
  'ซอร์สโค้ด': 'Source code',
  'ข้อมูลส่วนบุคคล': 'Data protection',
  'ความปลอดภัย': 'Security',
  'เวอร์ชัน': 'Releases',
  // ------------------------------------------------------------ labels
  'เมนูหลัก': 'Main menu',
  'สรุปข้อมูลสำคัญ': 'Key facts',
  'วิดีโอสาธิตการใช้งาน Cwork ตั้งแต่เข้าระบบจนถึงรอบเงินเดือน':
    'A walkthrough of Cwork, from signing in to a closed payroll run',
  'หกปัญหา': 'Six problems',
  // ------------------------------------------------ image descriptions
  'รอบเงินเดือนที่ปิดแล้ว แสดงจำนวนพนักงาน รายได้รวม รายการหัก ยอดสุทธิ และสลิปรายคน':
    'A closed payroll run, showing headcount, gross pay, deductions, net pay and each employee’s payslip',
  'ตารางกะและเวรรายวันของพนักงานแต่ละคน พร้อมวันหยุด':
    'The shift roster, showing each employee’s shift by day, with days off',
  'กล่องรออนุมัติ แสดงคำขอลาและคำขอเบิกค่าใช้จ่ายที่รอการตัดสินใจ':
    'The approvals inbox, showing a leave request and an expense claim awaiting a decision',
  'บันทึกการใช้งาน แสดงผู้กระทำ การกระทำ และเวลา ของทุกเหตุการณ์ในระบบ':
    'The audit log, showing who acted, what they did, and when, for every event in the system',
  'หน้าผู้สมัครงาน แสดงตำแหน่งที่เปิดรับและผู้สมัครในแต่ละขั้นตอน':
    'The candidates page, showing open positions and applicants at each stage',
  'แดชบอร์ด แสดงรายการรออนุมัติ จำนวนพนักงาน คำขอลา และรอบเงินเดือนล่าสุด':
    'The dashboard, showing pending approvals, headcount, leave requests and the latest payroll run',
  'ทะเบียนพนักงาน แสดงรายชื่อ รหัสพนักงาน ตำแหน่ง แผนก และอายุงาน':
    'The employee register, showing names, employee IDs, job titles, departments and length of service',
  'หน้าการลา แสดงคำขอลา ประเภทการลา ช่วงวันที่ และสถานะ':
    'The leave page, showing requests, leave types, date ranges and status',
  'ประวัติพนักงานรายคน แสดงข้อมูลการจ้าง วันลาคงเหลือ และผู้ใต้บังคับบัญชา':
    'An employee record, showing employment details, leave balances and direct reports',
  'หน้าประเมินผล แสดงรอบประเมินและเป้าหมาย KPI ถ่วงน้ำหนัก':
    'The performance page, showing a review cycle and weighted KPI goals',
  'หน้าลงเวลาทำงาน แสดงเวลาเข้า-ออก ชั่วโมงทำงาน การมาสาย และรายการที่ต้องตรวจสอบ':
    'The attendance page, showing clock-in and clock-out times, hours worked, lateness and punches to review',
  'ภาพหน้าจอแอปพนักงาน': 'Screenshots of the employee app',
  'หน้าแรกของแอปพนักงาน แสดงปุ่มลงเวลาและสรุปวันลา':
    'The employee app’s home screen, in Thai, with the clock-in button and leave balances',
  'หน้าสลิปเงินเดือนในแอปพนักงาน': 'A payslip in the employee app, in Thai',
  'ตัวอย่างการติดตั้ง จบด้วยการสร้างองค์กรและผู้ดูแลคนแรก':
    'A sample install, ending with the organisation and its first administrator created',
  // ----------------------------------- calculator notes, in the script
  'เทียบกับค่าระบบเดิม หลังหักค่าเซิร์ฟเวอร์แล้ว':
    'against your current bill, with the server already paid for',
  'เท่าทุนพอดีในปีแรก — ปีถัดไปค่าเซิร์ฟเวอร์เท่าเดิม แต่ค่าระบบเดิมมักขึ้นตามจำนวนคน':
    'Break-even in year one. The server costs the same next year; a per-seat bill usually does not.',
  'ค่าเซิร์ฟเวอร์สูงกว่าค่าระบบเดิม — ลองใช้เครื่องที่มีอยู่แล้ว หรือดูใหม่เมื่อพนักงานเพิ่มขึ้น':
    'The server costs more than your current bill — try a machine you already own, or look again as you hire.',
};

const TH = readFileSync(join(here, 'index.html'), 'utf8');

/**
 * Substitution is per text node and per attribute value, never across the whole
 * document: a raw search-and-replace lets a short entry like "คน" (people) eat
 * two characters out of the middle of a sentence that has no entry of its own,
 * and the result is a page that looks translated and is not.
 */
const missing = new Set();
const norm = (t) => t.replace(/\s+/g, ' ').trim();

function translateNode(raw) {
  if (!THAI.test(raw)) return raw;
  const lead = raw.match(/^\s*/)[0];
  const tail = raw.match(/\s*$/)[0];
  const key = norm(raw);
  if (key in COPY) return lead + COPY[key] + tail;
  missing.add(key);
  return raw;
}

/** Splits into tags and text, translating only the text. */
function translateText(html) {
  let inVerbatim = false;
  return html
    .split(/(<[^>]*>)/)
    .map((tok) => {
      if (tok.startsWith('<')) {
        const tag = /^<\/?(style|script)\b/i.exec(tok);
        if (tag) inVerbatim = tok[1] !== '/';
        return tok;
      }
      return inVerbatim ? tok : translateNode(tok);
    })
    .join('');
}

/** Copy also lives in alt text, aria labels and the calculator's own strings. */
function translateAttributes(html) {
  return html.replace(/(alt|aria-label|title|placeholder)="([^"]*)"/g, (m, name, value) =>
    THAI.test(value) ? `${name}="${translateNode(value)}"` : m,
  );
}

function translateScriptStrings(html) {
  return html.replace(/'([^'\n]*)'/g, (m, value) =>
    THAI.test(value) ? `'${translateNode(value)}'` : m,
  );
}

let out = TH;

// ------------------------------------------------------------------ head
out = out
  .replace('<html lang="th">', '<html lang="en">')
  .replace(
    '<title>Cwork — ระบบ HR ครบทั้งบริษัท ติดตั้งเอง ไม่จ่ายรายหัว</title>',
    '<title>Cwork — all of HR, self-hosted, with no per-seat fee</title>',
  )
  .replace(
    /<meta name="description" content="[^"]*">/,
    '<meta name="description" content="Open-source HR for Thai businesses — payroll to Thai law, attendance that is hard to fake, approvals from a phone and employee data kept safe under PDPA. Runs on your own server; you pay for the machine and nothing else.">',
  )
  .replace(
    '<link rel="canonical" href="https://suruchboss.github.io/Cwork/">',
    '<link rel="canonical" href="https://suruchboss.github.io/Cwork/en/">',
  )
  .replace('<meta property="og:locale" content="th_TH">', '<meta property="og:locale" content="en_GB">')
  .replace(
    '<meta property="og:locale:alternate" content="en_GB">',
    '<meta property="og:locale:alternate" content="th_TH">',
  )
  .replace(
    '<meta property="og:url" content="https://suruchboss.github.io/Cwork/">',
    '<meta property="og:url" content="https://suruchboss.github.io/Cwork/en/">',
  )
  .replace(
    /<meta property="og:title" content="[^"]*">/,
    '<meta property="og:title" content="Cwork — all of HR, self-hosted, with no per-seat fee">',
  )
  .replace(
    /<meta property="og:description" content="[^"]*">/,
    '<meta property="og:description" content="Six HR problems Thai businesses pay for every month — payroll, attendance, approvals and PDPA — solved in one system on your own server, with no per-seat fee.">',
  )
  .replace(
    /<meta property="og:image:alt" content="[^"]*">/,
    '<meta property="og:image:alt" content="Cwork — all of HR with no per-seat fee, beside the English dashboard">',
  )
  .replace('/assets/og.th.png">', '/assets/og.en.png">');

// ---------------------------------------------------------------- body
const scriptAt = out.indexOf('<script>');
out =
  translateAttributes(translateText(out.slice(0, scriptAt))) +
  translateScriptStrings(out.slice(scriptAt));

// ------------------------------------------------- paths, one level down
out = out.replace(/(src|href|poster)="assets\//g, '$1="../assets/');
// The walkthrough is recorded twice, once per language of burned-in caption
// (docs/demo/record.mjs, LANG_). The English page gets the English take —
// without this it would inherit the Thai one along with the path.
out = out.replace(/walkthrough\.th\.mp4/g, 'walkthrough.en.mp4');
// The console screenshots likewise: the English page shows the English console.
out = out.replace(/\.th\.webp/g, '.en.webp');

// ------------------------------------------------------ number formatting
out = out
  .replace("new Intl.NumberFormat('th-TH'", "new Intl.NumberFormat('en-GB'")
  .replace(/toLocaleString\('th-TH'\)/g, "toLocaleString('en-GB')");

// ----------------------------------------------------- language switcher
if (!TH.includes('class="lang"')) {
  console.error('landing/index.html has no language switcher — add one before building');
  process.exit(1);
}
out = out.replace(
  '<a class="lang" href="en/" hreflang="en" lang="en">English</a>',
  '<a class="lang" href="../" hreflang="th" lang="th">ภาษาไทย</a>',
);

// --------------------------------------------------------------- verify
if (missing.size > 0) {
  console.error(`${missing.size} Thai string(s) have no translation:`);
  for (const t of missing) console.error(`  ${JSON.stringify(t)}`);
  process.exit(1);
}
const strays = out
  .replace('>ภาษาไทย<', '><')
  .split(/(<[^>]*>)/)
  .filter((t) => !t.startsWith('<') && THAI.test(t));
if (strays.length > 0) {
  console.error('Thai left in the English page:', strays.map(norm));
  process.exit(1);
}
if (/walkthrough\.th\.mp4/.test(out)) {
  console.error('The English page still points at the Thai-captioned walkthrough.');
  process.exit(1);
}

const takes = [...out.matchAll(/"\.\.\/(assets\/shots\/[\w-]+\.en\.webp)"/g)].map((m) => m[1]);
const absent = [...new Set(takes)].filter((file) => !existsSync(join(here, file)));
if (absent.length > 0) {
  console.error(`English screenshots missing (run docs/screenshots/capture.mjs): ${absent.join(', ')}`);
  process.exit(1);
}

if (/(src|href|poster)="assets\//.test(out)) {
  console.error('asset paths were not rewritten');
  process.exit(1);
}

mkdirSync(join(here, 'en'), { recursive: true });
writeFileSync(join(here, 'en', 'index.html'), out);
console.log(`landing/en/index.html written — ${Object.keys(COPY).length} strings translated`);
