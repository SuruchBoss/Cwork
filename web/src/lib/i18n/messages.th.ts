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

  // Common (reused across screens)
  Search: 'ค้นหา',
  Status: 'สถานะ',
  Department: 'แผนก',
  Position: 'ตำแหน่ง',
  Employee: 'พนักงาน',
  All: 'ทั้งหมด',
  Pending: 'รออนุมัติ',
  Approved: 'อนุมัติแล้ว',
  Approve: 'อนุมัติ',
  Previous: 'ก่อนหน้า',
  Next: 'ถัดไป',
  'Page {page} of {total}': 'หน้า {page} จาก {total}',

  // Employee directory
  '{count} people you can access': '{count} คนที่คุณมีสิทธิ์เข้าถึง',
  'Name, employee code or email': 'ชื่อ รหัสพนักงาน หรืออีเมล',
  Working: 'ทำงานอยู่',
  Probation: 'ทดลองงาน',
  Left: 'พ้นสภาพแล้ว',
  'All departments': 'ทุกแผนก',
  Code: 'รหัส',
  Tenure: 'อายุงาน',
  'Started {date}': 'เริ่ม {date}',
  'No employees match': 'ไม่พบพนักงานตามเงื่อนไข',
  'Try adjusting the filters': 'ลองปรับตัวกรอง',

  // Offboarding
  'Resignation requests and the handover checklist before the last working day':
    'คำขอลาออกและรายการเคลียร์ของก่อนวันทำงานสุดท้าย',
  'Last working day': 'วันทำงานสุดท้าย',
  Notice: 'แจ้งล่วงหน้า',
  Hide: 'ซ่อน',
  Checklist: 'เคลียร์ของ',
  'No resignations match': 'ไม่มีคำขอลาออกตามเงื่อนไข',
  'Handover checklist — {name}': 'รายการเคลียร์ของ — {name}',
  '{done} / {total} done': '{done} / {total} เสร็จสิ้น',
  'Mark done': 'ทำเสร็จแล้ว',

  // Employee detail
  'No position': 'ไม่ระบุตำแหน่ง',
  'No department': 'ไม่ระบุแผนก',
  'Back to directory': 'กลับไปทะเบียน',
  'Employee information': 'ข้อมูลพนักงาน',
  'Work email': 'อีเมลที่ทำงาน',
  Phone: 'โทรศัพท์',
  'Work location': 'สถานที่ทำงาน',
  Manager: 'หัวหน้างาน',
  'Employment type': 'ประเภทการจ้าง',
  'Start date': 'วันเริ่มงาน',
  'Probation ends': 'ครบทดลองงาน',
  'National ID': 'เลขบัตรประชาชน',
  'Not permitted to view': 'ไม่มีสิทธิ์ดู',
  'User account': 'บัญชีผู้ใช้',
  '{email} · last login {time}': '{email} · เข้าใช้ล่าสุด {time}',
  'Leave balances': 'วันลาคงเหลือ',
  Type: 'ประเภท',
  Granted: 'ได้รับ',
  Used: 'ใช้ไป',
  Available: 'คงเหลือ',
  'Direct reports ({count})': 'ผู้ใต้บังคับบัญชา ({count})',
  'Employment history': 'ประวัติการทำงาน',
  'Effective date': 'วันที่มีผล',
  Event: 'เหตุการณ์',
  Note: 'หมายเหตุ',
  'No history yet': 'ยังไม่มีประวัติ',

  // Leave
  'All leave requests you can access': 'คำขอลาทั้งหมดที่คุณมีสิทธิ์เข้าถึง',
  'Matching the filter': 'รายการตามตัวกรอง',
  'On leave today': 'ลาวันนี้',
  'Including pending': 'รวมที่รออนุมัติ',
  'Active leave types': 'ประเภทการลาที่เปิดใช้',
  Rejected: 'ไม่อนุมัติ',
  'Leave type': 'ประเภทการลา',
  'All types': 'ทุกประเภท',
  'No.': 'เลขที่',
  'Date range': 'ช่วงวันที่',
  Days: 'จำนวนวัน',
  'Filed via AI assistant': 'ยื่นผ่านผู้ช่วย AI',
  Unpaid: 'ไม่รับค่าจ้าง',
  'No leave requests match': 'ไม่มีคำขอลาตามเงื่อนไข',

  // Attendance
  'Explain with AI': 'อธิบายด้วย AI',
  'Explain again': 'อธิบายอีกครั้ง',
  'Explain the flags': 'อธิบายธงลงเวลา',
  'Could not explain': 'อธิบายไม่สำเร็จ',
  'Groups the records to review by location and flag type, with distances and counts, to help tell a too-tight geofence from something worth checking — every figure comes from real data':
    'จัดกลุ่มรายการที่ต้องตรวจสอบตามสถานที่และชนิดธง พร้อมระยะห่างและจำนวน เพื่อช่วยแยกว่าเป็นเพราะตั้งค่าพื้นที่แคบไป หรือควรตรวจสอบจริง — ตัวเลขทั้งหมดมาจากข้อมูลจริง',
  'Daily clock-in/out records, with anything that needs review':
    'บันทึกเวลาเข้า-ออกงานรายวัน พร้อมรายการที่ต้องตรวจสอบ',
  'Records in range': 'รายการในช่วง',
  Late: 'มาสาย',
  Absent: 'ขาดงาน',
  'To review': 'ต้องตรวจสอบ',
  'Outside the geofence or with an anomaly': 'นอกพื้นที่ หรือมีสัญญาณผิดปกติ',
  From: 'ตั้งแต่วันที่',
  To: 'ถึงวันที่',
  Present: 'มาทำงาน',
  'On leave': 'ลา',
  Incomplete: 'ลงเวลาไม่ครบ',
  'Extra filter': 'ตัวกรองพิเศษ',
  'Only records to review': 'เฉพาะรายการที่ต้องตรวจสอบ',
  Date: 'วันที่',
  In: 'เข้า',
  Out: 'ออก',
  Worked: 'ทำงาน',
  Review: 'ตรวจสอบ',
  Locked: 'ปิดรอบแล้ว',
  'No attendance records in this range': 'ไม่มีข้อมูลการลงเวลาในช่วงนี้',
};
