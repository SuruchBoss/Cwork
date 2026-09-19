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
  'less than 1 year': 'น้อยกว่า 1 ปี',
};
