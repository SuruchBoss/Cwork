// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { LlmToolDefinition } from '../providers/llm-provider';

/**
 * Tools the assistant may call.
 *
 * Every tool is executed server-side against the *requesting user's* scope —
 * none of them accept an employee id, so the model cannot ask about someone
 * else even if a user tries to talk it into doing so.
 *
 * Tools that create records take `confirmed: true`, and the system prompt
 * requires the model to get an explicit yes from the human first.
 */
export const ASSISTANT_TOOLS: LlmToolDefinition[] = [
  {
    name: 'get_my_profile',
    description:
      'ดูข้อมูลพนักงานของผู้ใช้ปัจจุบัน เช่น ตำแหน่ง แผนก หัวหน้างาน วันเริ่มงาน และอายุงาน',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_leave_balance',
    description:
      'ดูวันลาคงเหลือของผู้ใช้ทุกประเภท (ลาพักร้อน ลาป่วย ลากิจ ฯลฯ) พร้อมจำนวนที่ใช้ไปและที่รออนุมัติ',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: 'ปีที่ต้องการดู ค่าเริ่มต้นคือปีปัจจุบัน' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_my_leave_requests',
    description: 'ดูรายการคำขอลาของผู้ใช้ พร้อมสถานะการอนุมัติ',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
          description: 'กรองตามสถานะ ไม่ระบุ = ทั้งหมด',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'จำนวนรายการ (ค่าเริ่มต้น 10)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'preview_leave_request',
    description:
      'คำนวณว่าการลาช่วงวันที่ระบุจะใช้วันลากี่วัน (ตัดวันหยุดและวันหยุดนักขัตฤกษ์ให้แล้ว) และวันลาคงเหลือหลังลา ใช้ตรวจสอบก่อนยื่นจริงเสมอ',
    inputSchema: {
      type: 'object',
      properties: {
        leaveTypeCode: {
          type: 'string',
          description: 'รหัสประเภทการลา เช่น ANNUAL, SICK, PERSONAL',
        },
        startDate: { type: 'string', description: 'วันที่เริ่มลา รูปแบบ YYYY-MM-DD' },
        endDate: { type: 'string', description: 'วันที่สิ้นสุดการลา รูปแบบ YYYY-MM-DD' },
        startPortion: {
          type: 'string',
          enum: ['FULL', 'MORNING', 'AFTERNOON'],
          description: 'ลาเต็มวัน ครึ่งเช้า หรือครึ่งบ่าย สำหรับวันแรก',
        },
        endPortion: {
          type: 'string',
          enum: ['FULL', 'MORNING', 'AFTERNOON'],
          description: 'ส่วนของวันสุดท้าย',
        },
      },
      required: ['leaveTypeCode', 'startDate', 'endDate'],
      additionalProperties: false,
    },
  },
  {
    name: 'submit_leave_request',
    description:
      'ยื่นคำขอลาแทนผู้ใช้ ต้องเรียก preview_leave_request ก่อนและให้ผู้ใช้ยืนยันรายละเอียดแล้วเท่านั้น',
    inputSchema: {
      type: 'object',
      properties: {
        leaveTypeCode: { type: 'string' },
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        startPortion: { type: 'string', enum: ['FULL', 'MORNING', 'AFTERNOON'] },
        endPortion: { type: 'string', enum: ['FULL', 'MORNING', 'AFTERNOON'] },
        reason: { type: 'string', description: 'เหตุผลการลา' },
        confirmed: {
          type: 'boolean',
          description: 'ต้องเป็น true และผู้ใช้ต้องยืนยันรายละเอียดแล้วเท่านั้น',
        },
      },
      required: ['leaveTypeCode', 'startDate', 'endDate', 'confirmed'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_attendance_today',
    description: 'ดูสถานะการลงเวลาวันนี้ของผู้ใช้ (เข้างานหรือยัง ออกงานหรือยัง กะที่ทำ)',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_attendance_summary',
    description: 'สรุปเวลาทำงานรายเดือนของผู้ใช้ เช่น จำนวนวันมาทำงาน สาย ขาด ชั่วโมงโอที',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer' },
        month: { type: 'integer', minimum: 1, maximum: 12 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_latest_payslip',
    description:
      'ดูสรุปสลิปเงินเดือนล่าสุดของผู้ใช้ (รายได้รวม รายการหัก และยอดสุทธิ) เฉพาะงวดที่เผยแพร่แล้ว',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer' },
        month: { type: 'integer', minimum: 1, maximum: 12 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'request_document',
    description:
      'ยื่นคำขอเอกสาร HR แทนผู้ใช้ เช่น หนังสือรับรองการทำงาน หนังสือรับรองเงินเดือน หรือ 50 ทวิ ต้องให้ผู้ใช้ยืนยันก่อน',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'EMPLOYMENT_CERTIFICATE',
            'SALARY_CERTIFICATE',
            'PAYSLIP_COPY',
            'TAX_WITHHOLDING_50BIS',
            'VISA_SUPPORT_LETTER',
            'BANK_LOAN_LETTER',
            'SOCIAL_SECURITY_LETTER',
            'OTHER',
          ],
        },
        language: { type: 'string', enum: ['th', 'en'], description: 'ภาษาของเอกสาร' },
        purpose: { type: 'string', description: 'วัตถุประสงค์ เช่น ยื่นขอวีซ่า' },
        addressedTo: { type: 'string', description: 'เรียน / ถึงหน่วยงานใด' },
        confirmed: { type: 'boolean', description: 'ต้องเป็น true หลังผู้ใช้ยืนยัน' },
      },
      required: ['type', 'confirmed'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_hr_policy',
    description:
      'ค้นหาระเบียบและนโยบาย HR จากเอกสารของบริษัท ใช้ทุกครั้งที่ผู้ใช้ถามเรื่องนโยบาย สิทธิ หรือขั้นตอน',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'คำค้น เช่น "ลาคลอด" "โอที" "สวัสดิการประกันสุขภาพ"',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_holidays',
    description: 'ดูวันหยุดนักขัตฤกษ์ของบริษัทในปีที่ระบุ',
    inputSchema: {
      type: 'object',
      properties: { year: { type: 'integer' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_pending_approvals',
    description:
      'ดูรายการคำขอที่รอผู้ใช้อนุมัติ (สำหรับหัวหน้างานเท่านั้น) ผู้ช่วยไม่สามารถอนุมัติแทนได้',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

/** Tools that create records; used to force the confirmation check. */
export const WRITE_TOOLS = new Set(['submit_leave_request', 'request_document']);
