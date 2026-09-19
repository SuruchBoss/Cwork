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
};
