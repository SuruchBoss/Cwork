// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Every word the film puts on screen, in both languages.
 *
 * The chapters are the landing page's six problems, in its order and with its
 * kanji, so the film and the page tell one story. Each chapter card names the
 * problem and how Cwork answers it; the beats underneath caption what the
 * viewer is watching happen, written as benefits rather than instructions —
 * this is the film that sells the product, not the one that trains on it.
 *
 * The two languages are written for their readers, not translated line by
 * line. Keys must match: film.mjs refuses to start if either side is missing
 * one, rather than recording a blank caption three minutes into a take.
 */
export const COPY = {
  th: {
    poster: ['ดูวิดีโอ', 'หกปัญหา · แก้บนระบบจริง'],
    title: {
      h2: 'งาน HR ทั้งบริษัท<br><em>ไม่ต้องจ่ายรายหัว</em>',
      sub: 'หกปัญหาที่ธุรกิจไทยจ่ายแพงทุกเดือน — ดูกันบนระบบที่รันอยู่จริง ไม่ใช่ภาพจำลอง',
    },
    roles: {
      hr: '<b>HR</b> วราภรณ์ สุขสวัสดิ์ · ผู้จัดการฝ่ายบุคคล',
      pay: '<b>PAYROLL</b> พิมพ์ชนก ศรีสุข · เจ้าหน้าที่เงินเดือน',
      mgr: '<b>MANAGER</b> ธนกร วิริยะกุล · หัวหน้าทีมวิศวกรรม',
      ofc: '<b>HR</b> ณัฐพล จันทร์เพ็ญ · เจ้าหน้าที่บุคคล',
      ceo: '<b>CEO</b> สมศักดิ์ ธนาวงศ์',
    },
    eyebrow: (n) => `ปัญหาที่ ${String(n).padStart(2, '0')} / 06`,
    c1: {
      title: 'ค่าระบบ HR<br>โตตาม<em>จำนวนคน</em>',
      rail: 'ค่าระบบ<br>ไม่โตตาม<em>จำนวนคน</em>',
      fix: 'โอเพนซอร์ส ติดตั้งบนเซิร์ฟเวอร์ของคุณเอง รับคนเพิ่มเท่าไร ค่ารายหัวก็ยังเป็นศูนย์',
      foot: 'สรรหา',
      offer: 'ผู้สมัครคนนี้ผ่านสัมภาษณ์แล้ว — <b>ยื่นข้อเสนอ</b>ได้เลย',
      hired: 'รับเข้าทีมอีกหนึ่งคน… <b>บิลเดือนหน้าไม่ขยับ</b>',
      callout: ['฿0', 'ค่ารายหัวต่อเดือน — จะ 20 หรือ 2,000 คน'],
    },
    c2: {
      title: 'ปิดงวดเงินเดือน<br>แบบ<em>ลุ้น</em>ทุกเดือน',
      rail: 'เงินเดือน<br>ที่<em>ไม่ต้องลุ้น</em>',
      fix: 'ภาษี ประกันสังคม กองทุนสำรองฯ คำนวณตามกฎหมายไทย — และคนทำอนุมัติงานตัวเองไม่ได้',
      foot: 'เงินเดือน',
      period: 'เปิดงวด<b>เดือนกันยายน</b> — กรอกแค่วันที่',
      calc: 'สร้างรอบ แล้ว<b>คำนวณทั้งบริษัทในคลิกเดียว</b>',
      done: 'ภาษีขั้นบันได ประกันสังคม กองทุนฯ <b>ครบทุกสลิป</b>',
      checker: 'คนเตรียมรอบ <b>อนุมัติเองไม่ได้</b> — ระบบบังคับ ไม่ใช่แค่นโยบาย',
      approve: 'ผู้จัดการ HR ตรวจแล้ว <b>อนุมัติ</b>',
      payslip: 'พนักงานเปิดสลิปเองในแอป — <b>ส่วนนายจ้างแยกให้เห็นชัด</b>',
      callout: ['8 สลิป', 'คำนวณเสร็จในไม่กี่วินาที'],
      stamp: 'APPROVED',
    },
    c3: {
      title: 'ลงเวลาแทนกัน<br>หน้างาน<em>ไม่มีสัญญาณ</em>',
      rail: 'ลงเวลา<br>ที่<em>โกงยาก</em>',
      fix: 'ลงเวลาจากมือถือที่ผูกกับตัวคน พร้อมพิกัดตอนกด — เน็ตหลุดก็ลงเวลาได้',
      foot: 'ลงเวลาทำงาน',
      offline: 'ไซต์งานนี้<b>ไม่มีสัญญาณ</b>',
      saved: 'กดลงเวลาได้ตามปกติ — <b>เก็บไว้ในเครื่องแบบเข้ารหัส</b>',
      online: 'สัญญาณกลับมา ระบบส่งให้เอง <b>ด้วยเวลาที่กดจริง</b>',
      hr: 'HR เห็นทันทีในหน้าลงเวลา — <b>ไม่ต้องรอใครส่งไฟล์</b>',
      shift: 'เพิ่มกะใหม่ในไม่กี่วินาที — <b>ระบบใช้คิดมาสายจริง</b>',
      badgeOff: 'ออฟไลน์ · ไม่มีสัญญาณ',
      badgeOn: 'กลับมาออนไลน์',
      shiftName: 'กะเช้า',
    },
    c4: {
      title: 'คำขอค้าง<br>เพราะ<em>รอลายเซ็น</em>',
      rail: 'อนุมัติ<br>ได้<em>ทุกที่</em>',
      fix: 'ลา เบิกเงิน ขอเอกสาร — ยื่นจากมือถือ หัวหน้าอนุมัติได้ทันที และวันลาไม่มีวันติดลบ',
      foot: 'การอนุมัติ',
      file: 'พนักงานยื่นลาจากมือถือ <b>22–26 ตุลาคม</b>',
      reason: 'พาคุณแม่ไปเที่ยวเชียงใหม่',
      charged: 'ขอ 5 วัน ระบบหักแค่ <b>2 วัน</b> — ไม่นับเสาร์-อาทิตย์และวันปิยมหาราช',
      inbox: 'หัวหน้าเห็นทันที <b>อนุมัติในคลิกเดียว</b>',
      known: 'พนักงาน<b>รู้ผลในแอป</b> ไม่ต้องตามถาม',
      doc: 'ขอหนังสือรับรองเอง <b>ไม่ต้องเดินไปฝ่ายบุคคล</b>',
      purpose: 'ยื่นขอวีซ่าท่องเที่ยวญี่ปุ่น',
      issue: 'อนุมัติแล้ว <b>ระบบออก PDF ให้ทันที</b> พร้อมรหัสตรวจสอบ',
      stamp: 'APPROVED',
    },
    c5: {
      title: 'ข้อมูลพนักงานรั่ว<br>คือความเสี่ยง <em>PDPA</em>',
      rail: 'ข้อมูลพนักงาน<br><em>ปลอดภัย</em>',
      fix: 'เข้ารหัสข้อมูลอ่อนไหว ยืนยันตัวตนสองขั้น และบันทึกทุกการเปิดดูแบบที่ไม่มีใครแก้ได้',
      foot: 'ความปลอดภัย',
      password: 'บัญชีที่เห็นข้อมูลอ่อนไหว… <b>รหัสผ่านอย่างเดียวเข้าไม่ได้</b>',
      code: 'ต้องยืนยันตัวตน<b>ขั้นที่สอง</b>จากแอปในมือถือ',
      masked: 'เจ้าหน้าที่ทั่วไป <b>เห็นแค่สี่หลักท้าย</b>',
      full: 'คนที่มีสิทธิ์เห็นเต็ม — <b>และระบบจดไว้ทุกครั้ง</b>',
      audit: 'ใคร เปิดดูอะไร เมื่อไร — <b>แก้หรือลบไม่ได้แม้แต่ผู้ดูแล</b>',
      callout: ['5 ล้าน', 'บาท — โทษปรับทางปกครองสูงสุดตาม PDPA'],
    },
    c6: {
      title: 'ระบบหลายตัว<br>ที่<em>ไม่คุยกัน</em>',
      rail: 'ครบใน<br><em>ระบบเดียว</em>',
      fix: 'สรรหา สวัสดิการ ประเมินผล คลังระเบียบ — ข้อมูลชุดเดียว ไม่ต้องกรอกซ้ำ',
      foot: 'ทั้งระบบ',
      benefit: 'ลงทะเบียนสวัสดิการ — <b>รอบเงินเดือนถัดไปคิดให้เอง</b>',
      policy:
        'คลังระเบียบบริษัท <b>ค้นได้ด้วยภาษาไทย</b> — และเป็นความรู้ให้ผู้ช่วย AI เมื่อเปิดใช้',
      docTitle: 'ระเบียบการทำงานจากที่บ้าน',
      docCategory: 'การทำงาน',
      docBody:
        'พนักงานทำงานจากที่บ้านได้สัปดาห์ละไม่เกิน 2 วัน โดยแจ้งหัวหน้างานล่วงหน้าอย่างน้อย 1 วันทำการ\n\nวันที่ทำงานจากที่บ้านให้ลงเวลาผ่านแอป Cwork ตามปกติ',
      kpi: 'ประเมินผลด้วย <b>KPI ถ่วงน้ำหนัก</b> ตลอดรอบ ไม่ใช่ปีละครั้ง',
      lang: 'ทั้งระบบเป็น<b>ภาษาอังกฤษ</b>ได้ในคลิกเดียว',
      theme: 'และ<b>ธีมมืด</b>สำหรับกะดึก',
    },
    end: {
      h2: 'ทั้งหมดนี้ <em>ฟรี</em><br>บนเซิร์ฟเวอร์ของคุณเอง',
      cmd: '<span>$</span> docker compose up -d',
    },
  },

  en: {
    poster: ['Watch the film', 'six problems · the real product'],
    title: {
      h2: 'All of HR,<br>with <em>no per-seat fee</em>',
      sub: 'Six HR problems Thai businesses pay for every month — solved on screen, in the real product.',
    },
    roles: {
      hr: '<b>HR</b> วราภรณ์ สุขสวัสดิ์ · HR manager',
      pay: '<b>PAYROLL</b> พิมพ์ชนก ศรีสุข · Payroll officer',
      mgr: '<b>MANAGER</b> ธนกร วิริยะกุล · Engineering lead',
      ofc: '<b>HR</b> ณัฐพล จันทร์เพ็ญ · HR officer',
      ceo: '<b>CEO</b> สมศักดิ์ ธนาวงศ์',
    },
    eyebrow: (n) => `Problem ${String(n).padStart(2, '0')} / 06`,
    c1: {
      title: 'Your HR bill grows<br>with <em>every hire</em>',
      rail: 'A bill that<br><em>never grows</em>',
      fix: 'Open source, on your own server. Hire as many people as you like — the per-seat fee stays at zero.',
      foot: 'Hiring',
      offer: 'This candidate passed the interview — <b>make the offer</b>',
      hired: 'One more on the team… <b>and next month’s bill doesn’t move</b>',
      callout: ['฿0', 'per employee, per month — for 20 people or 2,000'],
    },
    c2: {
      title: 'Closing payroll<br>shouldn’t be <em>a gamble</em>',
      rail: 'Payroll<br><em>without the gamble</em>',
      fix: 'Thai income tax, social security and provident fund, worked out for you — and no one can approve their own run.',
      foot: 'Payroll',
      period: 'Open <b>September</b> — just the dates',
      calc: 'Create the run, then <b>calculate the whole company in one click</b>',
      done: 'Progressive tax, social security, provident fund — <b>on every payslip</b>',
      checker: 'Whoever prepared it <b>can’t approve it</b> — enforced, not just policy',
      approve: 'The HR manager checks it, and <b>approves</b>',
      payslip: 'Staff open their own payslip — <b>employer contributions kept separate</b>',
      callout: ['8 payslips', 'calculated in seconds'],
      stamp: 'APPROVED',
    },
    c3: {
      title: 'Buddy punching,<br>and sites with <em>no signal</em>',
      rail: 'Attendance<br>that’s <em>hard to fake</em>',
      fix: 'Clock in from a phone bound to one person, located at the moment of the punch — even with no signal.',
      foot: 'Attendance',
      offline: 'This site has <b>no signal</b>',
      saved: 'Clock in as normal — <b>kept, encrypted, on the phone</b>',
      online: 'Signal’s back: it sends itself, <b>with the time it was really pressed</b>',
      hr: 'HR sees it straight away — <b>no spreadsheet to wait for</b>',
      shift: 'A new shift in seconds — <b>and lateness is measured against it</b>',
      badgeOff: 'Offline · no signal',
      badgeOn: 'Back online',
      shiftName: 'Early shift',
    },
    c4: {
      title: 'Requests stuck<br>waiting for <em>a signature</em>',
      rail: 'Approvals<br><em>from anywhere</em>',
      fix: 'Leave, expenses, documents — filed from a phone, approved in a tap, with a leave balance that can’t go negative.',
      foot: 'Approvals',
      file: 'Leave filed from a phone: <b>22–26 October</b>',
      reason: 'Taking my mother to Chiang Mai',
      charged: 'Five days asked, <b>two charged</b> — weekends and Chulalongkorn Day don’t count',
      inbox: 'The manager sees it at once — <b>one click to approve</b>',
      known: 'The answer <b>lands in the app</b> — no chasing',
      doc: 'An employment certificate, <b>self-served</b>',
      purpose: 'Applying for a Japanese tourist visa',
      issue: 'Approved, and <b>the PDF is issued on the spot</b>, with a code to verify it',
      stamp: 'APPROVED',
    },
    c5: {
      title: 'An employee data leak<br>is a <em>PDPA liability</em>',
      rail: 'Employee data,<br><em>protected</em>',
      fix: 'Sensitive fields encrypted, two-step sign-in for anyone who can see them, and every look recorded where no one can edit it.',
      foot: 'Security',
      password: 'An account that can see sensitive data… <b>a password alone won’t do</b>',
      code: 'It needs <b>a second step</b>, from the phone',
      masked: 'An ordinary HR login <b>sees only the last four digits</b>',
      full: 'Those entitled see it in full — <b>and every look is recorded</b>',
      audit: 'Who looked at what, and when — <b>not even an admin can edit it</b>',
      callout: ['฿5M', 'the top administrative fine under Thailand’s PDPA'],
    },
    c6: {
      title: 'Systems that<br><em>don’t talk</em> to each other',
      rail: 'All of it,<br><em>in one place</em>',
      fix: 'Hiring, benefits, reviews and your policy handbook — one system, one set of data, nothing typed twice.',
      foot: 'The whole system',
      benefit: 'Enrol someone in a benefit — <b>the next payroll picks it up</b>',
      policy:
        'A policy handbook <b>searchable in Thai</b> — and what the AI assistant answers from, when you turn it on',
      docTitle: 'Working from home',
      docCategory: 'Ways of working',
      docBody:
        'Staff may work from home up to two days a week, with one working day’s notice to their manager.\n\nOn a home-working day, clock in through the Cwork app as usual.',
      kpi: 'Reviews on <b>weighted KPIs</b>, checked in all year, not once a year',
      lang: 'The whole system in <b>Thai</b> — one click',
      theme: 'And a <b>dark theme</b> for the night shift',
    },
    end: {
      h2: 'All of it, <em>free</em>,<br>on your own server',
      cmd: '<span>$</span> docker compose up -d',
    },
  },
};

/** Every key path in a copy tree, for checking the two languages match. */
export function keys(tree, prefix = '') {
  return Object.entries(tree).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}
