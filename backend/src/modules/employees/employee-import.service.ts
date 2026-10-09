// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AuditAction, EmployeeStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { BusinessRuleError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CryptoService } from '../../core/security/crypto.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { columnLetter, readTable, TableError, type Table } from '../../core/spreadsheet/table';
import type { UploadedTable } from '../../core/spreadsheet/upload';
import { writeXlsx } from '../../core/spreadsheet/xlsx';
import { formatDateOnly, workDateFor } from '../../core/utils/date.util';
import { AuditService } from '../audit/audit.service';
import {
  EMPLOYEE_COLUMNS,
  importProblem,
  inReadingOrder,
  MAX_PROBLEMS,
  readEmployees,
  readHeader,
  type EmployeeColumn,
  type ImportedEmployee,
  type ImportProblem,
} from './domain/employee-import';
import { CreateEmployeeDto } from './dto/employee.dto';
import { EmployeesService } from './employees.service';

/** What the console shows before anything is written: who, or what is wrong. */
export interface ImportPreview {
  fileName: string;
  /** Employees the file would create; empty unless `problems` is. */
  employees: {
    row: number;
    employeeCode: string;
    name: string;
    hireDate: string;
    onProbation: boolean;
    scannerId: string | null;
    hasBankAccount: boolean;
  }[];
  problems: ImportProblem[];
}

/** Which import column each field of the API's form comes from. */
const FIELD_COLUMN: Record<string, EmployeeColumn> = {
  employeeCode: 'employee_code',
  titleTh: 'title_th',
  firstNameTh: 'first_name_th',
  lastNameTh: 'last_name_th',
  firstNameEn: 'first_name_en',
  lastNameEn: 'last_name_en',
  nickname: 'nickname',
  dateOfBirth: 'date_of_birth',
  nationalId: 'national_id',
  taxId: 'tax_id',
  socialSecurityNo: 'social_security_no',
  passportNo: 'passport_no',
  passportExpiresOn: 'passport_expires_on',
  workPermitNo: 'work_permit_no',
  workPermitExpiresOn: 'work_permit_expires_on',
  workEmail: 'work_email',
  personalEmail: 'personal_email',
  phone: 'phone',
  addressLine: 'address_line',
  province: 'province',
  postalCode: 'postal_code',
  hireDate: 'hire_date',
  probationEndDate: 'probation_end_date',
  scannerId: 'scanner_id',
};

/**
 * Bringing a company's people in from a spreadsheet (CW-059).
 *
 * Two calls with the same file: `preview` reads and checks it and writes
 * nothing; `commit` checks it again, because the file or the organisation may
 * have changed in between, and then writes every employee in one transaction
 * or none. Each employee goes through the same create path, and the same
 * validation, as one typed in through the API.
 */
@Injectable()
export class EmployeeImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly employees: EmployeesService,
  ) {}

  /** The template: the columns, in the requested language, and what goes in each. */
  template(language: 'th' | 'en'): { filename: string; content: Buffer } {
    const label = (column: (typeof EMPLOYEE_COLUMNS)[number]) =>
      `${language === 'th' ? column.th : column.en}${column.required ? ' *' : ''}`;
    const guide =
      language === 'th'
        ? [
            ['คอลัมน์', 'ต้องกรอก', 'กรอกอะไร'],
            ...EMPLOYEE_COLUMNS.map((c) => [
              c.th,
              c.required ? (c.alternative ? 'ต้องกรอก ถ้าไม่มีภาษาอังกฤษ' : 'ต้องกรอก') : '',
              c.hint.th,
            ]),
            [],
            ['กรอกหนึ่งคนต่อหนึ่งแถวในชีตแรก ลบคอลัมน์ที่ไม่ใช้ได้ แต่ห้ามเปลี่ยนชื่อหัวคอลัมน์'],
            [
              'บันทึกเป็น .xlsx หรือ CSV ก็ได้ ระบบจะตรวจทั้งไฟล์ก่อน และไม่บันทึกอะไรเลยถ้ายังมีแถวที่ผิด',
            ],
          ]
        : [
            ['Column', 'Required', 'What goes in it'],
            ...EMPLOYEE_COLUMNS.map((c) => [
              c.en,
              c.required
                ? c.alternative
                  ? 'Required unless the English one is given'
                  : 'Required'
                : '',
              c.hint.en,
            ]),
            [],
            [
              "One person per row on the first sheet. Columns you do not use can be deleted; don't rename the headings.",
            ],
            [
              'Save as .xlsx or CSV. The whole file is checked first, and nothing is saved while any row is wrong.',
            ],
          ];

    const content = writeXlsx([
      {
        name: language === 'th' ? 'พนักงาน' : 'Employees',
        header: true,
        widths: EMPLOYEE_COLUMNS.map((c) => c.width),
        rows: [EMPLOYEE_COLUMNS.map(label)],
      },
      {
        name: language === 'th' ? 'คำอธิบาย' : 'Guide',
        widths: [22, 10, 90],
        rows: guide.map((row) => row.map(String)),
      },
    ]);
    return {
      // ASCII on purpose: a browser saving a Blob may drop a Thai name.
      filename: language === 'th' ? 'cwork-employees-th.xlsx' : 'cwork-employees.xlsx',
      content: Buffer.from(content),
    };
  }

  async preview(user: AuthenticatedUser, file: UploadedTable): Promise<ImportPreview> {
    const { employees, problems } = await this.check(user, file);
    return {
      fileName: file.originalname,
      problems,
      employees: employees.map((e) => ({
        row: e.row,
        employeeCode: e.employeeCode,
        name: [e.titleTh, e.firstNameTh, e.lastNameTh].filter(Boolean).join(' '),
        hireDate: e.hireDate,
        onProbation: e.onProbation,
        scannerId: e.scannerId ?? null,
        hasBankAccount: e.bankAccount !== undefined,
      })),
    };
  }

  async commit(user: AuthenticatedUser, file: UploadedTable): Promise<{ created: number }> {
    const { employees, problems } = await this.check(user, file);
    if (problems.length > 0) {
      throw new BusinessRuleError(
        'IMPORT_HAS_PROBLEMS',
        `The file has ${problems.length} problem(s); nothing was imported`,
        { problems },
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        const idByCode = new Map<string, string>();
        for (const employee of employees) {
          const created = await this.employees.createInTransaction(
            tx,
            user,
            employee.employeeCode,
            toDto(employee),
            employee.onProbation ? EmployeeStatus.PROBATION : EmployeeStatus.ACTIVE,
          );
          idByCode.set(employee.employeeCode, created.id);

          if (employee.bankAccount) {
            const { bankCode, bankName, accountNo, accountName } = employee.bankAccount;
            await tx.employeeBankAccount.create({
              data: {
                employeeId: created.id,
                bankCode,
                bankName,
                accountNoEnc: this.crypto.encrypt(accountNo)!,
                accountNoLast4: CryptoService.lastChars(accountNo),
                accountName,
              },
            });
          }
        }

        // Managers named by code from within the file exist only now.
        for (const employee of employees) {
          if (employee.manager && 'code' in employee.manager) {
            await tx.employee.update({
              where: { id: idByCode.get(employee.employeeCode)! },
              data: { managerId: idByCode.get(employee.manager.code)! },
            });
          }
        }
      },
      // A few thousand rows is several thousand statements; the default five
      // seconds is sized for a request, not an import.
      { timeout: 120_000, maxWait: 10_000 },
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.CREATE,
      entityType: 'Employee',
      summary: `Imported ${employees.length} employee(s) from "${file.originalname}"`,
      changes: {
        fileName: file.originalname,
        rows: employees.length,
        employeeCodes: employees.map((e) => e.employeeCode),
      },
    });

    return { created: employees.length };
  }

  /** Reads the file and checks every row, against the organisation and the API's rules. */
  private async check(
    user: AuthenticatedUser,
    file: UploadedTable,
  ): Promise<{ employees: ImportedEmployee[]; problems: ImportProblem[] }> {
    let table: Table;
    try {
      table = readTable(file.buffer);
    } catch (error) {
      if (!(error instanceof TableError)) throw error;
      return { employees: [], problems: [importProblem(error.problem, { row: 0 })] };
    }

    const { employees, problems } = readEmployees(table, await this.context(user.organizationId));

    // The rules the API applies to one employee typed in, applied to every row
    // that got this far, so the file's problems are all listed at once.
    const all = [...problems];
    for (const employee of employees) {
      if (all.length >= MAX_PROBLEMS) break;
      const errors = await validate(plainToInstance(CreateEmployeeDto, toDto(employee)));
      all.push(...errors.map((error) => fromValidation(employee, error, table)));
    }
    if (all.length > 0) {
      return { employees: [], problems: inReadingOrder(all).slice(0, MAX_PROBLEMS) };
    }
    return { employees, problems: [] };
  }

  private async context(organizationId: string) {
    const [organization, existing, departments, positions, workLocations] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { timezone: true },
      }),
      this.prisma.employee.findMany({
        where: { organizationId },
        select: { id: true, employeeCode: true, scannerId: true, deletedAt: true },
      }),
      this.prisma.department.findMany({
        where: { organizationId, isActive: true, deletedAt: null },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.position.findMany({
        where: { organizationId, isActive: true, deletedAt: null },
        select: { id: true, code: true, title: true },
      }),
      this.prisma.workLocation.findMany({
        where: { organizationId, isActive: true, deletedAt: null },
        select: { id: true, code: true, name: true },
      }),
    ]);

    return {
      existingCodes: new Map(
        existing.map((e) => [e.employeeCode, { id: e.deletedAt ? null : e.id }] as const),
      ),
      takenScannerIds: new Map(
        existing
          .filter((e) => e.scannerId !== null)
          .map((e) => [e.scannerId!, e.employeeCode] as const),
      ),
      departments,
      positions: positions.map((p) => ({ id: p.id, code: p.code, name: p.title })),
      workLocations,
      today: formatDateOnly(workDateFor(new Date(), organization.timezone)),
    };
  }
}

/** One imported employee as the API's create form, for the same validation. */
function toDto(employee: ImportedEmployee): CreateEmployeeDto {
  return {
    employeeCode: employee.employeeCode,
    titleTh: employee.titleTh,
    firstNameTh: employee.firstNameTh,
    lastNameTh: employee.lastNameTh,
    firstNameEn: employee.firstNameEn,
    lastNameEn: employee.lastNameEn,
    nickname: employee.nickname,
    dateOfBirth: employee.dateOfBirth,
    gender: employee.gender,
    maritalStatus: employee.maritalStatus,
    nationalId: employee.nationalId,
    taxId: employee.taxId,
    socialSecurityNo: employee.socialSecurityNo,
    passportNo: employee.passportNo,
    passportExpiresOn: employee.passportExpiresOn,
    workPermitNo: employee.workPermitNo,
    workPermitExpiresOn: employee.workPermitExpiresOn,
    workEmail: employee.workEmail,
    personalEmail: employee.personalEmail,
    phone: employee.phone,
    addressLine: employee.addressLine,
    province: employee.province,
    postalCode: employee.postalCode,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    workLocationId: employee.workLocationId,
    managerId: employee.manager && 'id' in employee.manager ? employee.manager.id : undefined,
    employmentType: employee.employmentType,
    hireDate: employee.hireDate,
    probationEndDate: employee.probationEndDate,
    scannerId: employee.scannerId,
  };
}

/** A failed API rule, placed on the cell it came from. */
function fromValidation(
  employee: ImportedEmployee,
  error: ValidationError,
  table: Table,
): ImportProblem {
  const constraint = Object.keys(error.constraints ?? {})[0];
  const code =
    constraint === 'isEmail'
      ? 'INVALID_EMAIL'
      : constraint === 'isPhoneNumber'
        ? 'INVALID_PHONE'
        : 'INVALID_VALUE';
  const header = table.rows[0] ?? [];
  const index = readHeader(header).columns.index.get(FIELD_COLUMN[error.property]);
  return importProblem(
    code,
    {
      row: employee.row,
      ...(index !== undefined
        ? { column: columnLetter(index), header: String(header[index]) }
        : {}),
    },
    { value: String(error.value ?? '') },
  );
}
