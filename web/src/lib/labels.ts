/** Thai display labels for API enums, kept in one place for consistency. */

export const employeeStatusLabels: Record<string, string> = {
  PRE_BOARDING: 'รอเริ่มงาน',
  PROBATION: 'ทดลองงาน',
  ACTIVE: 'ทำงานปกติ',
  ON_LEAVE: 'ลาพัก',
  SUSPENDED: 'พักงาน',
  RESIGNED: 'ลาออกแล้ว',
  TERMINATED: 'เลิกจ้าง',
  RETIRED: 'เกษียณ',
};

export const leaveStatusLabels: Record<string, string> = {
  DRAFT: 'ฉบับร่าง',
  PENDING: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ไม่อนุมัติ',
  CANCELLED: 'ยกเลิก',
  CANCELLED_AFTER_APPROVAL: 'ยกเลิกหลังอนุมัติ',
};

export const attendanceStatusLabels: Record<string, string> = {
  NOT_STARTED: 'ยังไม่ลงเวลา',
  PRESENT: 'มาทำงาน',
  LATE: 'มาสาย',
  EARLY_LEAVE: 'ออกก่อนเวลา',
  ABSENT: 'ขาดงาน',
  ON_LEAVE: 'ลา',
  HOLIDAY: 'วันหยุดนักขัตฤกษ์',
  DAY_OFF: 'วันหยุดประจำสัปดาห์',
  INCOMPLETE: 'ลงเวลาไม่ครบ',
};

export const payrollStatusLabels: Record<string, string> = {
  DRAFT: 'ฉบับร่าง',
  CALCULATING: 'กำลังคำนวณ',
  CALCULATED: 'คำนวณแล้ว',
  PENDING_APPROVAL: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  PAID: 'จ่ายแล้ว',
  FAILED: 'ล้มเหลว',
  CANCELLED: 'ยกเลิก',
};

export const applicationStageLabels: Record<string, string> = {
  APPLIED: 'ใบสมัครใหม่',
  SCREENING: 'คัดกรอง',
  ASSESSMENT: 'ทำแบบทดสอบ',
  INTERVIEW: 'สัมภาษณ์',
  OFFER: 'ยื่นข้อเสนอ',
  HIRED: 'รับเข้าทำงาน',
  REJECTED: 'ไม่ผ่าน',
  WITHDRAWN: 'ถอนตัว',
};

export const approvalEntityLabels: Record<string, string> = {
  LEAVE_REQUEST: 'คำขอลา',
  OVERTIME_REQUEST: 'คำขอทำโอที',
  EXPENSE_CLAIM: 'คำขอเบิกค่าใช้จ่าย',
  ATTENDANCE_CORRECTION: 'คำขอแก้ไขเวลา',
  RESIGNATION: 'คำขอลาออก',
  JOB_REQUISITION: 'คำขออัตรากำลัง',
  JOB_OFFER: 'ข้อเสนอจ้างงาน',
  PAYROLL_RUN: 'รอบเงินเดือน',
  DOCUMENT_REQUEST: 'คำขอเอกสาร',
};

export const documentTypeLabels: Record<string, string> = {
  EMPLOYMENT_CERTIFICATE: 'หนังสือรับรองการทำงาน',
  SALARY_CERTIFICATE: 'หนังสือรับรองเงินเดือน',
  PAYSLIP_COPY: 'สำเนาสลิปเงินเดือน',
  TAX_WITHHOLDING_50BIS: 'หนังสือรับรองหักภาษี (50 ทวิ)',
  VISA_SUPPORT_LETTER: 'จดหมายรับรองขอวีซ่า',
  BANK_LOAN_LETTER: 'หนังสือรับรองขอสินเชื่อ',
  SOCIAL_SECURITY_LETTER: 'หนังสือรับรองประกันสังคม',
  OTHER: 'เอกสารอื่น ๆ',
};

export const anomalyFlagLabels: Record<string, string> = {
  MOCK_LOCATION: 'ตำแหน่งปลอม',
  ROOTED_DEVICE: 'เครื่อง root/jailbreak',
  OUTSIDE_GEOFENCE: 'นอกพื้นที่',
  NO_LOCATION: 'ไม่มีพิกัด',
  LOW_GPS_ACCURACY: 'GPS ไม่แม่นยำ',
  CLOCK_DRIFT: 'เวลาเครื่องคลาดเคลื่อน',
  NEW_DEVICE: 'อุปกรณ์ใหม่',
  IMPOSSIBLE_TRAVEL: 'เดินทางเร็วผิดปกติ',
};

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'PRESENT':
    case 'PAID':
    case 'HIRED':
    case 'ISSUED':
    case 'PUBLISHED':
      return 'success';
    case 'PENDING':
    case 'PENDING_APPROVAL':
    case 'PROBATION':
    case 'LATE':
    case 'CALCULATING':
    case 'INCOMPLETE':
    case 'SCREENING':
    case 'ASSESSMENT':
      return 'warning';
    case 'REJECTED':
    case 'ABSENT':
    case 'FAILED':
    case 'TERMINATED':
    case 'SUSPENDED':
      return 'danger';
    case 'CALCULATED':
    case 'INTERVIEW':
    case 'OFFER':
    case 'ON_LEAVE':
      return 'info';
    case 'DRAFT':
    case 'CANCELLED':
    case 'WITHDRAWN':
    case 'HOLIDAY':
    case 'DAY_OFF':
    case 'NOT_STARTED':
      return 'neutral';
    default:
      return 'brand';
  }
}
