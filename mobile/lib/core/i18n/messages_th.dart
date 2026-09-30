// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/// Thai translations for the mobile app, keyed by the English source string
/// (see i18n.dart). English is the key language, so this is the only catalogue:
/// a key missing here falls back to its English text. Thai is the default, so
/// the app renders exactly as before until the language is switched.
///
/// `{name}` placeholders are filled from the params passed to `tr`.
const Map<String, String> thMessages = <String, String>{
  // Bottom navigation
  'Home': 'หน้าแรก',
  'Leave': 'การลา',
  'Approvals': 'อนุมัติ',
  'Slips': 'สลิป',
  'Assistant': 'ผู้ช่วย',
  'Profile': 'โปรไฟล์',

  // Sign in
  'Sign in with your employee account': 'เข้าสู่ระบบด้วยบัญชีพนักงานของคุณ',
  'Email': 'อีเมล',
  'Please enter your email': 'กรุณากรอกอีเมล',
  'Invalid email': 'อีเมลไม่ถูกต้อง',
  'Password': 'รหัสผ่าน',
  'Please enter your password': 'กรุณากรอกรหัสผ่าน',
  'Show password': 'แสดงรหัสผ่าน',
  'Hide password': 'ซ่อนรหัสผ่าน',
  'Sign in': 'เข้าสู่ระบบ',
  'Verify': 'ยืนยัน',
  'Back': 'ย้อนกลับ',
  'This account must set up two-step verification first. Please set it up in the web console, then sign in again.':
      'บัญชีนี้ต้องตั้งค่ายืนยันตัวตนสองขั้นตอนก่อน กรุณาตั้งค่าผ่านเว็บคอนโซลแล้วเข้าสู่ระบบอีกครั้ง',
  'Enter the 6-digit code from your authenticator app or a recovery code':
      'กรอกรหัส 6 หลักจากแอป Authenticator หรือรหัสสำรอง',
  'Verification code': 'รหัสยืนยัน',

  // Home / clock card
  'Hello {name}': 'สวัสดี {name}',
  '{count} punches waiting to sync; they will send automatically when you are back online':
      'มีการลงเวลา {count} รายการรอส่ง จะส่งอัตโนมัติเมื่อกลับมาออนไลน์',
  'Send now': 'ส่งเลย',
  'Currently working': 'กำลังทำงานอยู่',
  'Not clocked in yet': 'ยังไม่ได้ลงเวลาเข้างาน',
  'In': 'เข้างาน',
  'Out': 'ออกงาน',
  'Worked': 'ทำงาน',
  'Clock in': 'ลงเวลาเข้างาน',
  'Clock out': 'ลงเวลาออกงาน',
  'Payroll period closed': 'ปิดรอบเงินเดือนแล้ว',
  'Late by {n} minutes': 'มาสาย {n} นาที',
  'Leave balance': 'วันลาคงเหลือ',
  'You have no leave entitlement this year': 'ยังไม่มีสิทธิ์วันลาในปีนี้',
  'Pending {n}': 'รอ {n}',
  '{n} days': '{n} วัน',
  'from {n} days': 'จาก {n} วัน',
  'Today’s punches': 'การลงเวลาวันนี้',
  '{m} m away': 'ห่าง {m} ม.',
  'Outside the area': 'นอกพื้นที่',

  // Attendance status
  'Present': 'มาทำงาน',
  'Late': 'มาสาย',
  'Early leave': 'ออกก่อนเวลา',
  'Absent': 'ขาดงาน',
  'On leave': 'ลา',
  'Holiday': 'วันหยุด',
  'Weekly day off': 'วันหยุดประจำสัปดาห์',
  'Incomplete': 'ลงเวลาไม่ครบ',
  'Not clocked in': 'ยังไม่ลงเวลา',

  // Profile
  'Work information': 'ข้อมูลการทำงาน',
  'Employee ID': 'รหัสพนักงาน',
  'Position': 'ตำแหน่ง',
  'Department': 'แผนก',
  'Manager': 'หัวหน้างาน',
  'Work location': 'สถานที่ทำงาน',
  'Start date': 'วันเริ่มงาน',
  'This month’s attendance summary': 'สรุปเวลาทำงานเดือนนี้',
  'Approved overtime': 'โอทีที่อนุมัติ',
  '{n} times ({detail})': '{n} ครั้ง ({detail})',
  'Request a document': 'ขอเอกสาร',
  'Employment certificate, etc.': 'หนังสือรับรองการทำงาน ฯลฯ',
  'Sign out': 'ออกจากระบบ',
  'Sign out?': 'ออกจากระบบ?',
  'You will need to sign in again next time.': 'คุณจะต้องเข้าสู่ระบบใหม่ในครั้งถัดไป',
  'Cancel': 'ยกเลิก',
  'Language': 'ภาษา',
  'Document type': 'ประเภทเอกสาร',
  'Purpose': 'วัตถุประสงค์',
  'e.g. applying for a visa': 'เช่น ยื่นขอวีซ่า',
  'Submit request': 'ยื่นคำขอ',
  'Your document request has been submitted. HR will get back to you when it is ready.':
      'ยื่นคำขอเอกสารเรียบร้อย HR จะแจ้งกลับเมื่อพร้อม',

  // Document types
  'Employment certificate': 'หนังสือรับรองการทำงาน',
  'Salary certificate': 'หนังสือรับรองเงินเดือน',
  'Tax withholding certificate (50 bis)': 'หนังสือรับรองหักภาษี (50 ทวิ)',
  'Visa support letter': 'จดหมายรับรองขอวีซ่า',
  'Bank loan letter': 'หนังสือรับรองขอสินเชื่อ',

  // Leave
  'Request leave': 'ขอลา',
  'My leave requests': 'คำขอลาของฉัน',
  'No leave requests yet': 'ยังไม่มีคำขอลา',
  'Tap “Request leave” to file your first request': 'กดปุ่ม “ขอลา” เพื่อยื่นคำขอแรกของคุณ',
  'Filed through the HR assistant': 'ยื่นผ่านผู้ช่วย HR',
  'Cancel request': 'ยกเลิกคำขอ',
  'Cancel this leave request?': 'ยกเลิกคำขอลา?',
  'No': 'ไม่ใช่',
  'Your leave request has been cancelled': 'ยกเลิกคำขอลาแล้ว',
  'Draft': 'ฉบับร่าง',
  'Pending approval': 'รออนุมัติ',
  'Approved': 'อนุมัติแล้ว',
  'Rejected': 'ไม่อนุมัติ',
  'Cancelled': 'ยกเลิก',
  'Cancelled after approval': 'ยกเลิกหลังอนุมัติ',

  // Leave request sheet
  'Select your leave dates': 'เลือกช่วงวันที่ลา',
  'File a leave request': 'ยื่นคำขอลา',
  'Leave type': 'ประเภทการลา',
  'unpaid': 'ไม่รับค่าจ้าง',
  'Leave dates': 'ช่วงวันที่ลา',
  'Select a date': 'เลือกวันที่',
  'Full day': 'เต็มวัน',
  'Morning': 'ครึ่งเช้า',
  'Afternoon': 'ครึ่งบ่าย',
  'Reason (optional)': 'เหตุผล (ไม่บังคับ)',
  'Your leave request has been submitted and is awaiting approval':
      'ยื่นคำขอลาเรียบร้อย รอผู้อนุมัติพิจารณา',
  'Before you submit': 'สรุปก่อนยื่น',
  'Days charged': 'จำนวนวันที่หัก',
  'Balance before': 'คงเหลือก่อนลา',
  'Balance after': 'คงเหลือหลังลา',
  'Charged dates (excluding weekends and public holidays)':
      'วันที่ถูกหัก (ไม่รวมวันหยุดและวันหยุดนักขัตฤกษ์)',
  'The selected range has no working days, so no leave is charged':
      'ช่วงที่เลือกไม่มีวันทำงาน จึงไม่หักวันลา',

  // Payslips
  'Payslips': 'สลิปเงินเดือน',
  'No payslips yet': 'ยังไม่มีสลิปเงินเดือน',
  'Slips will appear here once HR publishes a payroll run':
      'สลิปจะปรากฏที่นี่เมื่อฝ่ายบุคคลเผยแพร่รอบเงินเดือน',
  'Period {code}': 'งวด {code}',
  'New': 'ใหม่',
  'Paid on {date}': 'จ่ายวันที่ {date}',
  'Net': 'สุทธิ',
  'Payslip details': 'รายละเอียดสลิป',
  'Gross earnings': 'รายได้รวม',
  'Total deductions': 'รายการหักรวม',
  'Net pay': 'จ่ายสุทธิ',
  'Earnings': 'รายได้',
  'Deductions': 'รายการหัก',
  'Employer contributions (not deducted from pay)': 'นายจ้างสมทบ (ไม่หักจากเงินเดือน)',
  'Tax and social security': 'ข้อมูลภาษีและประกันสังคม',
  'Withholding tax': 'ภาษีหัก ณ ที่จ่าย',
  'Social security': 'ประกันสังคม',
  'Overtime hours paid': 'ชั่วโมงโอทีที่จ่าย',
  '{n} hr': '{n} ชม.',

  // Approvals
  'Pending approvals': 'รออนุมัติ',
  'No pending approvals': 'ไม่มีรายการรออนุมัติ',
  'You are all caught up': 'คุณเคลียร์งานหมดแล้ว',
  'Leave request': 'คำขอลา',
  'Overtime request': 'คำขอทำโอที',
  'Expense claim': 'คำขอเบิกค่าใช้จ่าย',
  'Attendance correction': 'คำขอแก้ไขเวลา',
  'Resignation': 'คำขอลาออก',
  'Document request': 'คำขอเอกสาร',
  '{n} baht': '{n} บาท',
  'Submitted {when}': 'ยื่นเมื่อ {when}',
  'Reason for rejection': 'เหตุผลที่ไม่อนุมัติ',
  'Explain it to the requester': 'อธิบายให้ผู้ยื่นทราบ',
  'Confirm': 'ยืนยัน',
  'Approved successfully': 'อนุมัติเรียบร้อย',
  'Rejected successfully': 'ไม่อนุมัติเรียบร้อย',
  'Reject': 'ไม่อนุมัติ',
  'Approve': 'อนุมัติ',

  // Assistant
  'HR assistant': 'ผู้ช่วย HR',
  'Start a new conversation': 'เริ่มบทสนทนาใหม่',
  'The HR assistant is not enabled': 'ผู้ช่วย HR ยังไม่เปิดใช้งาน',
  'Your organisation has not enabled the AI assistant — the rest of the app works as usual':
      'องค์กรของคุณยังไม่ได้เปิดใช้ผู้ช่วย AI — ฟังก์ชันอื่นของแอปใช้งานได้ตามปกติ',
  'Type a question about HR…': 'พิมพ์คำถามเกี่ยวกับงาน HR…',
  'Ask anything about HR': 'ถามอะไรก็ได้เกี่ยวกับงาน HR',
  'The assistant answers from company policy and sees only your own data':
      'ผู้ช่วยตอบจากระเบียบของบริษัท และเห็นเฉพาะข้อมูลของคุณเท่านั้น',
  'This answer was helpful': 'คำตอบนี้มีประโยชน์',
  'This answer did not help': 'คำตอบนี้ไม่ช่วย',
  'How many annual leave days do I have left?': 'เหลือวันลาพักร้อนกี่วัน',
  'When do I need a medical certificate for sick leave?': 'ขอลาป่วยต้องใช้ใบรับรองแพทย์เมื่อไหร่',
  'How is holiday overtime calculated?': 'ค่าโอทีวันหยุดคิดยังไง',
  'Request an employment certificate': 'ขอหนังสือรับรองการทำงาน',
  'How many times was I late this month?': 'เดือนนี้มาสายกี่ครั้ง',

  // Connecting to the company's server (CW-060)
  'Connect to your company': 'เชื่อมต่อกับบริษัทของคุณ',
  'Enter the address HR gave you, or scan their QR code.':
      'ใส่ที่อยู่ที่ HR ให้มา หรือสแกน QR code จาก HR',
  'Company address': 'ที่อยู่ของบริษัท',
  'Connect': 'เชื่อมต่อ',
  'Scan QR code': 'สแกน QR code',
  'Connect this app to': 'เชื่อมต่อแอปนี้กับ',
  'You will be signed out of {host}.': 'แอปจะออกจากระบบของ {host}',
  'Company: {host}': 'บริษัท: {host}',
  'Change': 'เปลี่ยน',
  'Enter the address HR gave you': 'กรุณาใส่ที่อยู่ที่ HR ให้มา',
  'That is not a web address. Check it with HR.': 'ที่อยู่นี้ไม่ใช่ที่อยู่เว็บ กรุณาตรวจสอบกับ HR',
  'The address must start with https://. Ask HR for the secure address.':
      'ที่อยู่ต้องขึ้นต้นด้วย https:// กรุณาขอที่อยู่แบบปลอดภัยจาก HR',
  '{n} punches have not been sent to {host} yet. Open the app with an internet '
          'connection so they are sent, then change the server.':
      'ยังมีเวลาเข้า-ออกงาน {n} รายการที่ยังไม่ได้ส่งไปที่ {host} '
          'กรุณาเปิดแอปขณะต่ออินเทอร์เน็ตให้ส่งเสร็จก่อน แล้วจึงเปลี่ยนบริษัท',
  'Could not reach {host}. Check the address and your internet connection.':
      'ติดต่อ {host} ไม่ได้ กรุณาตรวจสอบที่อยู่และการเชื่อมต่ออินเทอร์เน็ต',
  '{host} does not have a certificate this phone trusts. The company’s IT team '
          'needs to fix the server’s HTTPS certificate.':
      '{host} ใช้ใบรับรองที่โทรศัพท์เครื่องนี้ไม่เชื่อถือ '
          'ฝ่ายไอทีของบริษัทต้องแก้ใบรับรอง HTTPS ของเซิร์ฟเวอร์',
  '{host} answered, but it is not a Cwork server. Check the address with HR.':
      '{host} ตอบกลับมา แต่ไม่ใช่เซิร์ฟเวอร์ Cwork กรุณาตรวจสอบที่อยู่กับ HR',
  'Scan the QR code from HR': 'สแกน QR code จาก HR',
  'Point the camera at the code on the poster or on HR’s screen':
      'เล็งกล้องไปที่โค้ดบนโปสเตอร์หรือบนหน้าจอของ HR',
  'The camera is not allowed. You can type the address instead.':
      'ไม่ได้อนุญาตให้ใช้กล้อง พิมพ์ที่อยู่แทนได้',
  'The camera could not start. You can type the address instead.':
      'เปิดกล้องไม่สำเร็จ พิมพ์ที่อยู่แทนได้',
  'Type the address': 'พิมพ์ที่อยู่',

  // Shared widgets
  'Could not load': 'โหลดข้อมูลไม่สำเร็จ',
  'Try again': 'ลองอีกครั้ง',

  // Errors and controllers
  'An unexpected error occurred': 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
  'Could not connect to the network': 'ไม่สามารถเชื่อมต่อเครือข่ายได้',
  'Your session has expired, please sign in again': 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  'Sorry, {message}': 'ขออภัย {message}',
  'Sorry, the assistant is unavailable right now': 'ขออภัย ไม่สามารถติดต่อผู้ช่วยได้ในขณะนี้',
  'Clocked in successfully': 'บันทึกเวลาเข้างานเรียบร้อย',
  'Clocked out successfully': 'บันทึกเวลาออกงานเรียบร้อย',
  'Sent {n} saved punches': 'ส่งเวลาที่บันทึกไว้ {n} รายการเรียบร้อย',
  'Location services are off on the device': 'ปิดบริการตำแหน่งที่ตั้งบนอุปกรณ์',
  'Location permission was not granted': 'ไม่ได้อนุญาตให้เข้าถึงตำแหน่ง',
  'Location permission is permanently denied': 'ปฏิเสธสิทธิ์ตำแหน่งถาวร',
  'Could not find a location in time': 'หาตำแหน่งไม่สำเร็จภายในเวลาที่กำหนด',
  'Saved on your device; it will sync automatically when you are back online':
      'บันทึกเวลาไว้ในเครื่องแล้ว จะส่งให้ระบบอัตโนมัติเมื่อกลับมาออนไลน์',
  'GPS is imprecise (±{m} m); the record is saved for HR to review':
      'สัญญาณ GPS ไม่แม่นยำ (±{m} ม.) ระบบจะบันทึกไว้ให้ HR ตรวจสอบ',

  // CW-066: the leave form, its errors, and the reject dialog
  'No internet connection. Check your signal and try again':
      'ไม่มีอินเทอร์เน็ต ตรวจสอบสัญญาณแล้วลองอีกครั้ง',
  'Not enough leave left: you have {available} days, and this request needs {requested}':
      'วันลาไม่พอ คุณเหลือ {available} วัน แต่คำขอนี้ใช้ {requested} วัน',
  'You already have leave on some of these days ({from} – {to}). Pick other dates, or cancel that request first':
      'คุณมีคำขอลาบางวันในช่วงนี้อยู่แล้ว ({from} – {to}) เลือกวันอื่น หรือยกเลิกคำขอเดิมก่อน',
  'This leave type must be requested at least {days} days ahead. Pick a later date, or ask your manager':
      'ลาประเภทนี้ต้องยื่นล่วงหน้าอย่างน้อย {days} วัน เลือกวันที่ช้ากว่านี้ หรือคุยกับหัวหน้า',
  'This leave type needs a supporting document, such as a medical certificate. Send it to HR, who will file the request for you':
      'ลาประเภทนี้ต้องมีเอกสารประกอบ เช่น ใบรับรองแพทย์ ส่งเอกสารให้ HR แล้ว HR จะยื่นคำขอให้',
  'The days you picked are all days off. Pick at least one working day':
      'วันที่เลือกเป็นวันหยุดทั้งหมด เลือกอย่างน้อยหนึ่งวันทำงาน',
  'This leave type is taken in full days only. Choose "Full day"':
      'ลาประเภทนี้ลาได้เต็มวันเท่านั้น เลือก "เต็มวัน"',
  'That is more days in a row than this leave type allows. Split it into shorter requests':
      'ลาติดกันเกินกว่าที่ลาประเภทนี้อนุญาต แบ่งเป็นคำขอที่สั้นลง',
  'You have not worked here long enough for this leave type yet. Ask HR if you are unsure':
      'อายุงานยังไม่ถึงเกณฑ์ของลาประเภทนี้ ถ้าไม่แน่ใจ สอบถาม HR',
  'This leave type is not available to you. Ask HR': 'คุณใช้ลาประเภทนี้ไม่ได้ สอบถาม HR',
  'This leave has already started, so it cannot be cancelled here. Ask your manager':
      'การลานี้เริ่มไปแล้ว ยกเลิกในแอปไม่ได้ กรุณาคุยกับหัวหน้า',
  'This request can no longer be cancelled': 'คำขอนี้ยกเลิกไม่ได้แล้ว',
  'Someone has already decided this request. Pull down to refresh the list':
      'คำขอนี้มีผู้พิจารณาไปแล้ว ดึงหน้าจอลงเพื่อโหลดรายการใหม่',
  'First day of leave': 'วันแรกที่ลา',
  'Last day of leave': 'วันสุดท้ายที่ลา',
  'Until': 'ถึงวันที่',
  '{date} (one day)': '{date} (ลาวันเดียว)',
  'Choose a leave type': 'เลือกประเภทการลาก่อน',
  'Choose the day your leave starts': 'เลือกวันแรกที่ลา',
  'Keep it': 'ไม่ยกเลิก',
  'The requester sees this reason': 'ผู้ยื่นจะเห็นเหตุผลนี้',
  'Reject request': 'ยืนยันไม่อนุมัติ',
};
