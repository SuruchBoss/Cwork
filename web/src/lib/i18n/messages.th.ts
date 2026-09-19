/**
 * Thai translations, keyed by the English source string (see i18n/index.ts).
 *
 * English is the key language, so this is the only catalogue: an entry missing
 * here falls back to its English key. Grows per area as screens are localised
 * (CW-016); this batch covers the app shell, navigation, shared components and
 * the formatters.
 */
export const thMessages: Record<string, string> = {
  // Navigation — sections
  Overview: 'ภาพรวม',
  Employees: 'พนักงาน',
  'Time & leave': 'เวลาและการลา',
  Compensation: 'ค่าตอบแทน',
  Recruitment: 'สรรหา',
  Administration: 'จัดการระบบ',

  // Navigation — items
  Dashboard: 'แดชบอร์ด',
  Approvals: 'รออนุมัติ',
  'HR assistant': 'ผู้ช่วย HR',
  'Employee directory': 'ทะเบียนพนักงาน',
  Offboarding: 'การลาออก',
  'Performance / KPI': 'ประเมินผล / KPI',
  Leave: 'การลา',
  Attendance: 'ลงเวลาทำงาน',
  'Shifts & roster': 'กะและตารางเวร',
  Payroll: 'เงินเดือน',
  Expenses: 'เบิกค่าใช้จ่าย',
  Benefits: 'สวัสดิการ',
  Candidates: 'ผู้สมัครงาน',
  'Document requests': 'คำขอเอกสาร',
  'HR knowledge base': 'ฐานความรู้ HR',
  'Organisation structure': 'โครงสร้างองค์กร',
  'Activity log': 'บันทึกการใช้งาน',

  // App shell
  'Main menu': 'เมนูหลัก',
  'Open or close menu': 'เปิด/ปิดเมนู',
  'Close menu': 'ปิดเมนู',
  'Sign out': 'ออกจากระบบ',
  Language: 'ภาษา',
  'Toggle light/dark theme': 'สลับธีมสว่าง/มืด',
  'Switch to light theme': 'เปลี่ยนเป็นธีมสว่าง',
  'Switch to dark theme': 'เปลี่ยนเป็นธีมมืด',

  // Shared components
  'Something went wrong': 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
  'Try again': 'ลองอีกครั้ง',
  Loading: 'กำลังโหลด',

  // Formatters (units)
  hr: 'ชม.',
  min: 'นาที',
  yr: 'ปี',
  days: 'วัน',
  'less than 1 year': 'น้อยกว่า 1 ปี',

  // Route guards & not-found
  'Checking permissions': 'กำลังตรวจสอบสิทธิ์',
  'You do not have access to this page': 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้',
  'If you think this is a mistake, contact your administrator':
    'หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ',
  'Page not found': 'ไม่พบหน้าที่คุณต้องการ',
  'The link may have changed, or you may not have access to this section':
    'ลิงก์อาจเปลี่ยนไปแล้ว หรือคุณไม่มีสิทธิ์เข้าถึงส่วนนี้',
  'Back to home': 'กลับหน้าแรก',

  // Dashboard
  'Hi {name}': 'สวัสดี {name}',
  'Your HR tasks for today': 'ภาพรวมงาน HR ที่ต้องดำเนินการวันนี้',
  'Your approvals': 'รออนุมัติของคุณ',
  'Tap to act': 'กดเพื่อดำเนินการ',
  'Nothing pending': 'ไม่มีรายการค้าง',
  'Active employees': 'พนักงานที่ทำงานอยู่',
  'Including those on probation': 'รวมพนักงานทดลองงาน',
  'Leave requests pending': 'คำขอลารออนุมัติ',
  'Across the organisation you can see': 'ทั้งองค์กรที่คุณมองเห็น',
  'Latest payroll run': 'รอบเงินเดือนล่าสุด',
  'No runs yet': 'ยังไม่มีรอบ',
  'Pending approvals': 'รายการรออนุมัติ',
  'View all': 'ดูทั้งหมด',
  'No approvals waiting': 'ไม่มีรายการรออนุมัติ',
  'You are all caught up': 'คุณเคลียร์งานหมดแล้ว',
  'Recent leave requests': 'คำขอลาล่าสุด',
  'No leave requests pending': 'ไม่มีคำขอลารออนุมัติ',
};
