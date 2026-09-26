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
 * One thing the English page has to be careful about: the screenshots are all
 * in Thai, so an English reader cannot tell from them that the product's own
 * interface is Thai by default and switches to English (CW-016). The screens
 * lede says so, so they learn it here rather than after installing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// U+0E3F ฿ is in the Thai block but is a currency symbol, not script: it reads
// the same on either page, so it must not count as something left untranslated.
const THAI = /[\u0E01-\u0E3E\u0E40-\u0E7F]/;

/** Thai source → English. Longest first, so a substring never eats its parent. */
const COPY = {
  // ---------------------------------------------------------------- nav
  'คิดค่าใช้จ่าย': 'What it costs',
  'หน้าตาระบบ': 'The screens',
  'แตะเพื่อดูภาพขนาดเต็ม': 'Tap to open full size',
  'ความสามารถ': 'What it does',
  'ข้อมูลพนักงาน · PDPA': 'Employee data · PDPA',
  'ข้อมูลพนักงาน': 'Employee data',
  'สำหรับฝ่าย IT': 'For IT',
  'ดาวน์โหลดฟรี': 'Download free',
  'เมนูหลัก': 'Main menu',

  // --------------------------------------------------------------- hero
  'ใช้งานได้แล้ว · v0.3.1': 'Working today · v0.3.1',
  'ติดตั้งบนเครื่องของคุณเอง': 'Runs on your own server',
  'ทำตามกฎหมายแรงงานไทย': 'Built for Thai labour law',
  'งาน HR ครบทั้งบริษัท': 'All of HR, company-wide',
  'ไม่ต้องจ่าย': 'with no ',
  'รายหัว': 'per-seat fee',
  'ทะเบียนพนักงาน วันลา ลงเวลา เงินเดือน และการอนุมัติ ครบในระบบเดียว ติดตั้งบนเครื่องของบริษัทคุณเอง จ่ายแค่ค่าเซิร์ฟเวอร์ ไม่มีค่าใช้จ่ายต่อพนักงาน และไม่มีสัญญารายปี':
    'People, leave, attendance, payroll and approvals in one system, installed on your own server. You pay for the machine and nothing else — no charge per employee, no annual contract.',
  'ดูว่าประหยัดได้เท่าไหร่': 'See what you would save',
  'ดูหน้าตาระบบ': 'See the screens',
  'ฝ่าย IT ติดตั้งเองได้ด้วย Docker สามคำสั่ง —': 'Your IT team installs it with three Docker commands —',
  'ส่งขั้นตอนให้เขา': 'send them the steps',
  'ระบบจริงที่รันอยู่ ไม่ใช่ภาพจำลอง': 'The running product, not a mock-up',
  'วิดีโอสาธิตการใช้งาน Cwork ตั้งแต่เข้าระบบจนถึงรอบเงินเดือน':
    'A walkthrough of Cwork, from signing in to a closed payroll run',

  // --------------------------------------------------------- calculator
  'ปีหนึ่งคุณจ่ายค่าระบบ HR ไปเท่าไหร่': 'What does your HR system cost you a year?',
  'ระบบ HR ส่วนใหญ่คิดเป็นรายหัวต่อเดือน ยิ่งบริษัทโต ค่าใช้จ่ายยิ่งโตตาม ลองใส่ตัวเลขของคุณเองดู':
    'Most HR systems charge per employee per month, so the bill grows every time you hire. Put your own numbers in.',
  'พนักงานในระบบ': 'Employees in the system',
  'คน × ฿': 'people × ฿',
  'คน': 'people',
  'ค่าระบบที่จ่ายอยู่ ต่อคนต่อเดือน': 'What you pay now, per person per month',
  'ใส่ราคาที่คุณจ่ายอยู่จริง ตัวเลขที่ใส่ไว้เป็นแค่ตัวอย่าง':
    'Use the price you actually pay — the number filled in is only an example.',
  'ค่าเซิร์ฟเวอร์ที่จะใช้รัน Cwork ต่อเดือน': 'What a server to run Cwork would cost, per month',
  'VPS ขนาดเล็กก็พอสำหรับบริษัทหลักร้อยคน ถ้ามีเซิร์ฟเวอร์อยู่แล้วใส่ 0':
    'A small VPS is enough for a company of a few hundred. Enter 0 if you already have a server.',
  'ประหยัดได้ปีละ': 'You would save, per year',
  'ระบบเดิม ·': 'Your system now ·',
  '× 12 เดือน': '× 12 months',
  'Cwork · ค่าลิขสิทธิ์': 'Cwork · licence',
  'Cwork · ค่าเซิร์ฟเวอร์ปีละ': 'Cwork · server, per year',
  'ดูขั้นตอนติดตั้ง': 'See the install steps',
  'เทียบกับค่าระบบเดิม หลังหักค่าเซิร์ฟเวอร์แล้ว': 'against your current bill, with the server already paid for',
  'เท่าทุนพอดีในปีแรก — ปีถัดไปค่าเซิร์ฟเวอร์เท่าเดิม แต่ค่าระบบเดิมมักขึ้นตามจำนวนคน':
    'Break-even in year one. The server costs the same next year; a per-seat bill usually does not.',
  'ค่าเซิร์ฟเวอร์สูงกว่าค่าระบบเดิม — ลองใช้เครื่องที่มีอยู่แล้ว หรือดูใหม่เมื่อพนักงานเพิ่มขึ้น':
    'The server costs more than your current bill — try a machine you already own, or look again as you hire.',

  // ------------------------------------------------------------ screens
  'หน้าจอที่ฝ่ายบุคคลเปิดทุกวัน': 'The screens HR opens every day',
  'ไทยและอังกฤษ สลับได้ทั้งระบบ เงินบาท และคำที่ HR ใช้จริง':
    'Thai and English, switchable throughout — Thai by default, with baht and the words Thai HR teams actually use.',
  'ใบลาทั้งบริษัท อยู่ในหน้าจอเดียว': 'Every leave request in one place',
  'ใครขอ ลาประเภทไหน กี่วัน — ระบบนับวันให้ตามปฏิทินวันหยุดของบริษัท หัวหน้ากดอนุมัติจากตรงนี้ได้เลย':
    'Who asked, what kind of leave, how many days — counted against your own holiday calendar. Managers approve from here.',
  'ทะเบียนพนักงานที่ค้นเจอโดยไม่ต้องเปิด Excel': 'An employee register you do not keep in Excel',
  'ชื่อ รหัส ตำแหน่ง แผนก อายุงาน สัญญา และเอกสารประจำตัว รวมอยู่ที่เดียว ไม่ต้องเปิดไฟล์ Excel หลายไฟล์':
    'Name, ID, job title, department, length of service, contracts and identity documents — one record instead of a folder of spreadsheets.',
  'ปิดรอบเงินเดือนแล้วเห็นยอดทันที': 'Close a payroll run and see the figures',
  'รายได้รวม ภาษีหัก ณ ที่จ่าย ประกันสังคม และยอดจ่ายสุทธิ พร้อมสลิปที่พนักงานเปิดดูเองได้จากมือถือ':
    'Gross pay, withholding tax, social security and net pay — with payslips employees open on their own phones.',
  'หน้ารายการคำขอลา แสดงชื่อพนักงาน ประเภทการลา ช่วงวันที่ จำนวนวัน และสถานะรออนุมัติ':
    'The leave request list, showing employee names, leave types, date ranges, day counts and pending status',
  'หน้าทะเบียนพนักงาน แสดงรายชื่อ รหัสพนักงาน ตำแหน่ง แผนก และอายุงาน':
    'The employee register, showing names, employee IDs, job titles, departments and length of service',
  'หน้าสรุปเงินเดือน แสดงรอบล่าสุด จำนวนพนักงาน รายได้รวม และยอดจ่ายสุทธิ':
    'The payroll summary, showing the latest run, headcount, gross pay and net pay',

  // ----------------------------------------------------------- features
  'ครบตั้งแต่วันแรกที่พนักงานเข้างาน จนถึงวันที่ลาออก':
    'Everything from an employee’s first day to their last',
  'เงินเดือน': 'Payroll',
  'คำนวณตามกฎหมายไทย ไม่ใช่สูตรต่างประเทศที่ดัดแปลงมา':
    'Computed to Thai law, not a foreign formula bent to fit',
  'ภาษีหัก ณ ที่จ่ายแบบขั้นบันได ประกันสังคม กองทุนสำรองเลี้ยงชีพ และอัตราโอทีตาม พ.ร.บ. คุ้มครองแรงงาน':
    'Progressive withholding tax, social security, provident fund, and overtime rates from the Labour Protection Act.',
  'ย้อนดูที่มาของทุกตัวเลขในสลิปได้ แม้ผ่านไปเป็นปี':
    'Trace where any figure on a payslip came from, a year later',
  'แยกให้เห็นว่าอะไรคือเงินสมทบฝั่งนายจ้าง ไม่ได้หักจากพนักงาน':
    'Employer contributions shown separately from what is deducted from the employee',
  'พนักงานรายเดือนได้เต็มเดือน ไม่ถูกหารตามจำนวนวันที่มีข้อมูลลงเวลา':
    'Monthly salaries are not pro-rated by however many days have attendance data',
  'การลา': 'Leave',
  'ยอดวันลาที่ตรงกับความจริงเสมอ': 'Leave balances that are always true',
  'ประเภทการลาตามกฎหมายไทย สะสมตามอายุงาน ลาครึ่งวันและลาเป็นชั่วโมงได้':
    'Thai statutory leave types, accrual by length of service, half-days and hours.',
  'คำขอที่ยังไม่อนุมัติ': 'A request still waiting ',
  'กันวันไว้ทันที': 'holds the days immediately',
  'สองคำขอที่ทับกันจึงแย่งวันเดียวกันไม่ได้':
    ' — two overlapping requests cannot claim the same day',
  'ระบบตัดวันหยุดนักขัตฤกษ์ออกจากการนับให้เอง':
    'Public holidays come out of the count on their own',
  'ลงเวลา': 'Attendance',
  'กำหนดพื้นที่ลงเวลาได้ โดยไม่กันคนเข้างาน': 'Geofencing that never locks anyone out',
  'ลงเวลาเข้า-ออกพร้อมพิกัดและการตรวจจับความผิดปกติ ตารางกะ และการแก้ไขเวลาย้อนหลังที่มีร่องรอย':
    'Clock in and out with coordinates and anomaly detection, shift rosters, and back-dated corrections that leave a trail.',
  'ลงเวลานอกพื้นที่จะ': 'A punch outside the fence is ',
  'ขึ้นเตือนให้ตรวจ': 'flagged for review',
  'ไม่ใช่ถูกปฏิเสธ — คนที่มาทำงานจริงต้องลงเวลาได้เสมอ':
    ', never refused — someone who genuinely turned up must always be able to record it',
  'HR มาไล่ดูทีหลังได้ ดีกว่าปล่อยให้พนักงานยืนเถียงกับโทรศัพท์อยู่หน้างาน':
    'HR reviews the flags afterwards, rather than leaving an employee arguing with a phone at the gate',
  'การอนุมัติ': 'Approvals',
  'ระบบอนุมัติชุดเดียว ใช้กับทุกเรื่อง': 'One approval system for everything',
  'ลา โอที เบิกค่าใช้จ่าย แก้ไขเวลา ลาออก คำขออัตรากำลัง ใบเสนอจ้าง รอบเงินเดือน และคำขอเอกสาร':
    'Leave, overtime, expenses, time corrections, resignations, headcount requests, job offers, payroll runs and document requests.',
  'กำหนดผู้อนุมัติจากหัวหน้าสายงาน หัวหน้าแผนก บทบาท หรือระบุตัวบุคคล':
    'Route to the line manager, the department head, a role, or a named person',
  'ตั้งเงื่อนไขได้ เช่น วงเงินเกินเท่าไรถึงต้องผ่านอีกขั้น':
    'Add conditions — over this amount, it needs one more signature',
  'สรรหา': 'Hiring',
  'เปิดหน้าสมัครงานให้คนนอก พร้อมขอความยินยอมตาม PDPA':
    'A public applications page, with PDPA consent built in',
  'ตั้งแต่คำขออัตรากำลัง ประกาศงาน แบบทดสอบที่ตรวจอัตโนมัติ สัมภาษณ์ ไปจนถึงใบเสนอจ้างที่กดครั้งเดียวกลายเป็นพนักงานในระบบ':
    'From the headcount request and the job posting through auto-marked tests and interviews, to an offer that becomes an employee record in one click.',
  'ไม่ให้ความยินยอม PDPA ระบบไม่รับใบสมัครตั้งแต่ต้น':
    'Without PDPA consent the application is not accepted at all',
  'ข้อมูลผู้สมัครที่ไม่ได้รับเข้าทำงานถูกลบอัตโนมัติใน 12 เดือน':
    'Unsuccessful applicants are deleted automatically after 12 months',
  'ประเมินผล': 'Performance',
  'KPI ถ่วงน้ำหนักได้ และปรับเทียบกันทั้งองค์กร': 'Weighted KPIs, calibrated across the company',
  'รอบประเมินที่มีการตั้งเป้า เช็คอินระหว่างทาง ประเมินตนเอง ประเมินโดยหัวหน้า และการปรับเทียบโดย HR':
    'Review cycles with goal setting, check-ins along the way, self-assessment, manager assessment and calibration by HR.',
  'น้ำหนัก KPI รวมกันเกิน 100 ไม่ได้ เพราะมันคือตัวหารของคะแนน':
    'KPI weights cannot total more than 100, because that total is the divisor',
  'หัวหน้าที่ให้เกรดไม่สามารถปรับเทียบเกรดของตัวเองได้':
    'A manager who graded someone cannot calibrate their own grades',

  // --------------------------------------------------------------- pdpa
  'ข้อมูลพนักงานคือภาระ ไม่ใช่สินทรัพย์': 'Employee data is a liability, not an asset',
  'ระบบ HR เก็บของที่อ่อนไหวที่สุดในบริษัท — เลขบัตรประชาชน เลขบัญชีธนาคาร ประวัติการลาป่วย และพิกัดของคน Cwork ออกแบบมาโดยถือว่าของพวกนี้คือภาระที่ต้องรับผิดชอบ ไม่ใช่ข้อมูลที่ยิ่งเก็บยิ่งดี':
    'An HR system holds the most sensitive records in the company — national ID numbers, bank accounts, sick leave history, and where people were standing. Cwork is built on the assumption that this is a responsibility to carry, not data to accumulate.',
  'พิกัดบันทึกเฉพาะตอนกดลงเวลา': 'Location is recorded only at the moment someone clocks in',
  'ไม่มีการตามตำแหน่งระหว่างวัน ไม่มีอะไรทำงานอยู่เบื้องหลัง และไม่บันทึกพิกัดในจังหวะอื่นเลย':
    'No tracking through the day, nothing running in the background, and no coordinates captured at any other moment.',
  'เลขบัตรประชาชนและเลขบัญชีเข้ารหัสในฐานข้อมูล':
    'National ID and bank account numbers are encrypted in the database',
  'ฝ่ายบุคคลเห็นแค่สี่หลักท้าย จะดูเลขเต็มต้องกดขอ และทุกครั้งที่กดถูกบันทึกไว้':
    'HR sees the last four digits. Revealing the full number takes a deliberate action, and every reveal is recorded.',
  'มีเอกสารกำหนดว่าเก็บข้อมูลนานแค่ไหน และลบอย่างไร':
    'There is a written retention period and a real erasure procedure',
  'พร้อมแบบร่างประกาศความเป็นส่วนตัวภาษาไทยสำหรับแจกพนักงาน และขั้นตอนที่ทดสอบกับฐานข้อมูลจริงมาแล้ว':
    'Including a draft Thai privacy notice to hand to employees, and steps that have been run against a real database.',
  'ถ้าไม่เปิดเอง ไม่มีข้อมูลออกนอกเครื่องเลย':
    'Nothing leaves the machine unless you switch it on',
  'อีเมล แจ้งเตือนเข้ามือถือ ผู้ช่วย AI และที่เก็บไฟล์ภายนอก ปิดไว้ทั้งหมดจนกว่าคุณจะเปิดเอง':
    'Email, push notifications, the AI assistant and external file storage are all off until you turn them on.',
  'ข้อที่เราบอกตรง ๆ:': 'Said plainly:',
  'ระบบยังไม่ลบข้อมูลพนักงานให้อัตโนมัติเมื่อครบกำหนด — ผู้ดูแลต้องกำหนดนโยบายและลงมือเอง เอกสารบอกไว้ว่าต้องทำอย่างไรทีละขั้น รวมถึงข้อเท็จจริงที่ไม่สวย เช่น':
    'Cwork does not yet delete employee data automatically when its retention period ends — the operator sets the policy and runs the procedure. The documentation walks through it step by step, including the awkward parts. For instance:',
  'พนักงานที่เคยลงเวลาแล้วจะลบออกจากฐานข้อมูลไม่ได้':
    'an employee who has ever clocked in cannot be deleted from the database',
  'เพราะตารางลงเวลาถูกล็อกให้เขียนเพิ่มได้อย่างเดียว วิธีที่ถูกคือลบข้อมูลระบุตัวตนออก แล้วเก็บเวลาทำงานไว้':
    ', because the attendance table is append-only at the database level. The right move is to strip what identifies them and keep the hours worked.',
  'อ่านเอกสารข้อมูลส่วนบุคคลฉบับเต็ม →': 'Read the full data-protection document →',

  // ----------------------------------------------------------- security
  'ความปลอดภัย': 'Security',
  'กฎที่ผู้ดูแลระบบก็แหกไม่ได้': 'Rules the administrator cannot break either',
  'แก้ประวัติย้อนหลังไม่ได': 'History cannot be rewritten',
  'แก้ประวัติย้อนหลังไม่ได้': 'History cannot be rewritten',
  'ฐานข้อมูลปฏิเสธการแก้และการลบรายการเก่า แม้คำสั่งนั้นจะมาจากตัวระบบเอง ถึงมีคนเจาะเข้ามาได้ ก็เพิ่มรายการใหม่ได้อย่างเดียว ลบร่องรอยของตัวเองไม่ได้':
    'The database refuses updates and deletes on past records, even when the instruction comes from the application itself. Someone who breaks in can add rows; they cannot remove their own tracks.',
  'รหัสผ่านอย่างเดียวเข้าไม่ได้': 'A password alone gets you nowhere',
  'ใครที่อ่านเลขบัตรประชาชนได้ ทำเงินเดือนได้ หรือแจกสิทธิ์ให้คนอื่นได้ ต้องใส่รหัสจากแอปยืนยันตัวตนทุกครั้ง และรหัสหนึ่งตัวใช้ได้ครั้งเดียว':
    'Anyone who can read a national ID, run payroll or grant permissions enters a code from an authenticator app every time, and each code works once.',
  'คนเตรียมรอบเงินเดือน อนุมัติเองไม่ได้': 'Whoever prepares payroll cannot approve it',
  'เจ้าหน้าที่เงินเดือนเตรียมรอบ ผู้จัดการ HR เป็นคนเซ็นอนุมัติ ระบบบังคับไว้เอง ไม่ใช่แค่นโยบายบนกระดาษที่ใครก็ข้ามได้':
    'The payroll officer prepares the run and the HR manager signs it off. The software enforces that, rather than leaving it as a policy on paper that anyone can step around.',
  'สแกนไฟล์ที่อัปโหลดเข้ามาก่อนเก็บเสมอ': 'Uploads are scanned before they are stored',
  'เรซูเม่ที่คนนอกอัปโหลดเข้ามาคือไฟล์ที่ไว้ใจได้น้อยที่สุดในระบบ ระบบจึงส่งไปสแกนก่อนทุกไฟล์ และสแกนเนอร์ที่ใช้งานไม่ได้ไม่เคยแปลว่า “ผ่าน”':
    'A CV uploaded by a stranger is the least trustworthy file in the system, so every one goes to the scanner first — and a scanner that is unreachable never counts as a pass.',
  'ระบบที่เพิ่งติดตั้ง ไม่ตกเป็นของคนที่เข้ามาก่อน':
    'A fresh install does not belong to whoever finds it first',
  'ผู้ดูแลคนแรกสร้างได้สองทางเท่านั้น: คำสั่งที่ต้องมีสิทธิ์เข้าถึงเซิร์ฟเวอร์ หรือหน้าเว็บที่ถือโทเคนใช้ครั้งเดียวซึ่งมีแต่คำสั่งนั้นออกให้ได้':
    'There are exactly two ways to create the first administrator: a command that requires access to the server, or a web page holding a single-use token that only that command can issue.',
  'ผู้ช่วย AI ถามแทนคนอื่นไม่ได้': 'The AI assistant cannot ask on anyone else’s behalf',
  'ผู้ช่วยไม่มีช่องทางให้ระบุว่า “ขอดูข้อมูลของคนนั้น” ได้เลย มันเห็นได้แค่ข้อมูลของคนที่กำลังถามอยู่ ต่อให้ถูกหลอกสำเร็จก็ไม่มีอะไรให้หลุด และระบบปิดผู้ช่วยไว้เป็นค่าตั้งต้น':
    'There is no way to say “show me that person’s record” — the assistant sees only the data of whoever is asking. Talk it into anything you like; there is nothing there to leak. It is off by default.',

  // ---------------------------------------------------------------- app
  'แอปพนักงาน': 'Employee app',
  'ออกแบบมาสำหรับโทรศัพท์ที่สัญญาณหลุด': 'Built for phones that lose signal',
  'ไซต์ก่อสร้าง ห้องเย็น ชั้นใต้ดินของห้าง — ที่ที่พนักงานต้องลงเวลาจริง มักเป็นที่ที่เน็ตไม่มี':
    'Building sites, cold rooms, the basement of a shopping centre — the places people actually clock in are the places with no connection.',
  'ลงเวลาตอนออฟไลน์ได้': 'Clocking in works offline',
  'รายการที่ยังส่งไม่ได้ถูกเก็บไว้ในเครื่อง แล้วส่งให้เองเมื่อกลับมาออนไลน์':
    'Anything that cannot be sent is kept on the device and goes out by itself once there is a connection.',
  'ส่งซ้ำไม่กลายเป็นลงเวลาสองครั้ง': 'A retry never becomes a second punch',
  'ทุกรายการมีรหัสประจำตัวที่เครื่องสร้างขึ้นเอง เซิร์ฟเวอร์จึงรู้ว่ารายการไหนซ้ำ':
    'Every entry carries an identifier the device generated, so the server knows which ones it has already seen.',
  'ดูสลิป ขอลา และอนุมัติได้ในเครื่องเดียว': 'Payslips, leave requests and approvals on one device',
  'หัวหน้างานกดอนุมัติจากมือถือได้ ไม่ต้องรอกลับไปเปิดคอม':
    'A supervisor approves from their phone instead of waiting to get back to a desk.',
  'ภาพหน้าจอแอปพนักงาน': 'Screenshots of the employee app',
  'หน้าแรกของแอปพนักงาน แสดงปุ่มลงเวลาและสรุปวันลา':
    'The employee app home screen, showing the clock-in button and a leave summary',
  'หน้าสลิปเงินเดือนในแอปพนักงาน': 'The payslip screen in the employee app',

  // ------------------------------------------------------------ install
  'เครื่องเดียวจบ ไม่ต้องมีทีมดูแล': 'One machine, and nobody to keep it running',
  'ส่งหัวข้อนี้ให้คนที่ดูแลเซิร์ฟเวอร์ของบริษัทได้เลย สิ่งที่ต้องมีคือเครื่องหนึ่งเครื่องกับ Docker — ไม่ต้องมี Redis ไม่ต้องมี message broker ไม่ต้องมี Kubernetes เพราะ PostgreSQL ตัวเดียวทำงานทั้งหมดนั้นแทน':
    'Send this section to whoever looks after your servers. It needs one machine and Docker — no Redis, no message broker, no Kubernetes, because a single PostgreSQL does all of that instead.',
  'เตรียมเครื่องและความลับ': 'Prepare the machine and its secrets',
  'compose จะไม่ยอมเริ่มทำงานถ้ายังไม่ได้ตั้งคีย์พวกนี้':
    'compose refuses to start until these are set',
  '# คีย์เข้ารหัสข้อมูล': '# field encryption key',
  'เริ่มระบบ แล้วสร้างตารางฐานข้อมูล': 'Start it, then create the tables',
  'ขั้นนี้ยังไม่มีข้อมูลอะไรในระบบ': 'Nothing is in the system yet at this point',
  'เลือกทางที่ต้องการ': 'Pick a path',
  'ลองดูก่อน': 'Just looking',
  '— โหลดบริษัทตัวอย่างที่มีพนักงาน 8 คน รอบเงินเดือนที่ปิดแล้ว ใบลาที่รออนุมัติ และผู้สมัครงานกลางขั้นตอน ทุกหน้ามีของให้ดู':
    ' — loads a demo company of 8 people, a closed payroll run, leave waiting for approval and candidates part-way through hiring. Every screen has something on it.',
  'ใช้งานจริง': 'Using it for real',
  '— สร้างองค์กรของคุณเอง หนึ่งองค์กร บทบาทระบบ 8 บทบาท ผู้ดูแลหนึ่งบัญชี ไม่มีข้อมูลตัวอย่างให้ต้องตามลบ':
    ' — creates your own organisation: one organisation, the eight system roles, one administrator. No demo data to hunt down and delete afterwards.',
  'เปิดใช้งาน': 'Open it',
  'เข้าที่': 'Go to',
  '— ผู้ดูแลคนแรกถือสิทธิ์ทั้งหมด ระบบจึงบังคับให้ตั้งการยืนยันตัวตนสองขั้นตอนก่อนเข้าใช้งานครั้งแรก เตรียมแอป Authenticator ไว้ด้วย':
    ' — the first administrator holds every permission, so Cwork makes you set up two-factor authentication before the first session. Have an authenticator app ready.',
  'เซิร์ฟเวอร์ของบริษัท': 'your company’s server',
  'ตัวอย่างการติดตั้ง จบด้วยการสร้างองค์กรและผู้ดูแลคนแรก':
    'An example install, ending with the organisation and the first administrator created',
  'ชื่อองค์กร :': 'organisation :',
  'บริษัท ตัวอย่าง จำกัด': 'Example Co., Ltd.',
  'เขตเวลา :': 'timezone    :',
  'อีเมลผู้ดูแล :': 'admin email :',
  'รหัสผ่าน :': 'password    :',
  'องค์กร · 8 บทบาท · ผู้ดูแล 1 บัญชี': 'organisation · 8 roles · 1 administrator',
  'ไม่มีข้อมูลตัวอย่างให้ต้องตามลบ': 'no demo data to clean up afterwards',

  // ------------------------------------------------------------- footer
  'ระบบบริหารทรัพยากรบุคคลแบบโอเพนซอร์ส · Apache-2.0':
    'Open-source HR information system · Apache-2.0',
  'ซอร์สโค้ด': 'Source code',
  'ข้อมูลส่วนบุคคล': 'Data protection',
  'เวอร์ชัน': 'Releases',
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
    '<meta name="description" content="Open-source HR information system for Thai companies — people, leave, attendance, Thai payroll and an employee app. Runs on your own server; you pay for the machine and nothing else.">',
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
    '<meta property="og:description" content="People, leave, attendance, Thai payroll and an employee app, on your own server. No charge per employee, no annual contract.">',
  )
  .replace(
    /<meta property="og:image:alt" content="[^"]*">/,
    '<meta property="og:image:alt" content="The Cwork dashboard, showing pending approvals, headcount and the latest payroll run">',
  );

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

if (/(src|href|poster)="assets\//.test(out)) {
  console.error('asset paths were not rewritten');
  process.exit(1);
}

mkdirSync(join(here, 'en'), { recursive: true });
writeFileSync(join(here, 'en', 'index.html'), out);
console.log(`landing/en/index.html written — ${Object.keys(COPY).length} strings translated`);
