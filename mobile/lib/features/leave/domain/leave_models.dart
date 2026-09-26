// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

class LeaveBalance {
  const LeaveBalance({
    required this.leaveTypeId,
    required this.code,
    required this.name,
    required this.colorHex,
    required this.granted,
    required this.used,
    required this.pending,
    required this.available,
    required this.isPaid,
  });

  final String leaveTypeId;
  final String code;
  final String name;
  final String colorHex;
  final double granted;
  final double used;
  final double pending;
  final double available;
  final bool isPaid;

  factory LeaveBalance.fromJson(Map<String, dynamic> json) => LeaveBalance(
        leaveTypeId: json['leaveTypeId'] as String,
        code: json['code'] as String,
        name: json['name'] as String,
        colorHex: json['colorHex'] as String? ?? '#2563eb',
        granted: (json['granted'] as num?)?.toDouble() ?? 0,
        used: (json['used'] as num?)?.toDouble() ?? 0,
        pending: (json['pending'] as num?)?.toDouble() ?? 0,
        available: (json['available'] as num?)?.toDouble() ?? 0,
        isPaid: json['isPaid'] as bool? ?? true,
      );

  int get color {
    final String hex = colorHex.replaceFirst('#', '');
    return int.tryParse('FF$hex', radix: 16) ?? 0xFF2563EB;
  }
}

class LeaveType {
  const LeaveType({
    required this.id,
    required this.code,
    required this.name,
    required this.allowHalfDay,
    required this.requiresAttachment,
    required this.minNoticeDays,
    required this.isPaid,
  });

  final String id;
  final String code;
  final String name;
  final bool allowHalfDay;
  final bool requiresAttachment;
  final int minNoticeDays;
  final bool isPaid;

  factory LeaveType.fromJson(Map<String, dynamic> json) => LeaveType(
        id: json['id'] as String,
        code: json['code'] as String,
        name: json['name'] as String,
        allowHalfDay: json['allowHalfDay'] as bool? ?? true,
        requiresAttachment: json['requiresAttachment'] as bool? ?? false,
        minNoticeDays: json['minNoticeDays'] as int? ?? 0,
        isPaid: json['isPaid'] as bool? ?? true,
      );
}

class LeaveRequest {
  const LeaveRequest({
    required this.id,
    required this.requestNo,
    required this.leaveTypeName,
    required this.colorHex,
    required this.startDate,
    required this.endDate,
    required this.totalDays,
    required this.status,
    required this.createdViaAssistant,
    this.reason,
  });

  final String id;
  final String requestNo;
  final String leaveTypeName;
  final String colorHex;
  final DateTime startDate;
  final DateTime endDate;
  final double totalDays;
  final String status;
  final bool createdViaAssistant;
  final String? reason;

  factory LeaveRequest.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> type = json['leaveType'] as Map<String, dynamic>;
    return LeaveRequest(
      id: json['id'] as String,
      requestNo: json['requestNo'] as String,
      leaveTypeName: type['name'] as String,
      colorHex: type['colorHex'] as String? ?? '#2563eb',
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
      totalDays: double.tryParse(json['totalDays'].toString()) ?? 0,
      status: json['status'] as String,
      createdViaAssistant: json['createdViaAssistant'] as bool? ?? false,
      reason: json['reason'] as String?,
    );
  }

  bool get isCancellable => status == 'DRAFT' || status == 'PENDING' || status == 'APPROVED';
}

/// The cost preview shown before a request is submitted, so the employee sees
/// exactly which days are charged — weekends and public holidays excluded.
class LeavePreview {
  const LeavePreview({
    required this.totalDays,
    required this.chargedDates,
    required this.balanceBefore,
    required this.balanceAfter,
    required this.warnings,
  });

  final double totalDays;
  final List<String> chargedDates;
  final double balanceBefore;
  final double balanceAfter;
  final List<String> warnings;

  factory LeavePreview.fromJson(Map<String, dynamic> json) => LeavePreview(
        totalDays: (json['totalDays'] as num?)?.toDouble() ?? 0,
        chargedDates: (json['days'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => (e as Map<String, dynamic>)['date'].toString())
            .toList(),
        balanceBefore: (json['balanceBefore'] as num?)?.toDouble() ?? 0,
        balanceAfter: (json['balanceAfter'] as num?)?.toDouble() ?? 0,
        warnings: (json['warnings'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => e.toString())
            .toList(),
      );
}
