// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

// Attendance models. Hand-written rather than generated: the app has a dozen
// of these and adding build_runner to the contributor workflow would cost more
// than it saves.

class AttendancePunch {
  const AttendancePunch({
    required this.id,
    required this.type,
    required this.method,
    required this.punchedAt,
    required this.isOutsideGeofence,
    required this.anomalyFlags,
    this.distanceM,
    this.workLocationName,
  });

  final String id;
  final String type;
  final String method;
  final DateTime punchedAt;
  final bool isOutsideGeofence;
  final List<String> anomalyFlags;
  final int? distanceM;
  final String? workLocationName;

  factory AttendancePunch.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic>? location = json['workLocation'] as Map<String, dynamic>?;
    return AttendancePunch(
      id: json['id'] as String,
      type: json['type'] as String,
      method: json['method'] as String,
      punchedAt: DateTime.parse(json['punchedAt'] as String),
      isOutsideGeofence: json['isOutsideGeofence'] as bool? ?? false,
      anomalyFlags: (json['anomalyFlags'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic e) => e.toString())
          .toList(),
      distanceM: json['distanceM'] as int?,
      workLocationName: location?['name'] as String?,
    );
  }
}

class AttendanceRecord {
  const AttendanceRecord({
    required this.status,
    required this.workedMinutes,
    required this.lateMinutes,
    required this.overtimeMinutes,
    required this.anomalyFlags,
    required this.isLocked,
    this.firstClockInAt,
    this.lastClockOutAt,
  });

  final String status;
  final int workedMinutes;
  final int lateMinutes;
  final int overtimeMinutes;
  final List<String> anomalyFlags;
  final bool isLocked;
  final DateTime? firstClockInAt;
  final DateTime? lastClockOutAt;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) => AttendanceRecord(
        status: json['status'] as String? ?? 'NOT_STARTED',
        workedMinutes: json['workedMinutes'] as int? ?? 0,
        lateMinutes: json['lateMinutes'] as int? ?? 0,
        overtimeMinutes: json['overtimeMinutes'] as int? ?? 0,
        anomalyFlags: (json['anomalyFlags'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => e.toString())
            .toList(),
        isLocked: json['lockedAt'] != null,
        firstClockInAt: json['firstClockInAt'] == null
            ? null
            : DateTime.parse(json['firstClockInAt'] as String),
        lastClockOutAt: json['lastClockOutAt'] == null
            ? null
            : DateTime.parse(json['lastClockOutAt'] as String),
      );
}

class ShiftInfo {
  const ShiftInfo({
    required this.name,
    required this.startTime,
    required this.endTime,
    required this.breakMinutes,
  });

  final String name;
  final String startTime;
  final String endTime;
  final int breakMinutes;

  factory ShiftInfo.fromJson(Map<String, dynamic> json) => ShiftInfo(
        name: json['name'] as String,
        startTime: json['startTime'] as String,
        endTime: json['endTime'] as String,
        breakMinutes: json['breakMinutes'] as int? ?? 0,
      );
}

/// What the home screen needs to render today's clock-in card.
class AttendanceDay {
  const AttendanceDay({
    required this.date,
    required this.isClockedIn,
    required this.nextAction,
    required this.punches,
    this.record,
    this.shift,
  });

  final String date;
  final bool isClockedIn;
  final String nextAction;
  final List<AttendancePunch> punches;
  final AttendanceRecord? record;
  final ShiftInfo? shift;

  factory AttendanceDay.fromJson(Map<String, dynamic> json) => AttendanceDay(
        date: json['date'] as String,
        isClockedIn: json['isClockedIn'] as bool? ?? false,
        nextAction: json['nextAction'] as String? ?? 'CLOCK_IN',
        punches: (json['punches'] as List<dynamic>? ?? <dynamic>[])
            .map((dynamic e) => AttendancePunch.fromJson(e as Map<String, dynamic>))
            .toList(),
        record: json['record'] == null
            ? null
            : AttendanceRecord.fromJson(json['record'] as Map<String, dynamic>),
        shift: json['shift'] == null
            ? null
            : ShiftInfo.fromJson(json['shift'] as Map<String, dynamic>),
      );
}

class AttendanceSummary {
  const AttendanceSummary({
    required this.presentDays,
    required this.absentDays,
    required this.lateDays,
    required this.leaveDays,
    required this.workedMinutes,
    required this.lateMinutes,
    required this.approvedOvertimeMinutes,
  });

  final int presentDays;
  final int absentDays;
  final int lateDays;
  final int leaveDays;
  final int workedMinutes;
  final int lateMinutes;
  final int approvedOvertimeMinutes;

  factory AttendanceSummary.fromJson(Map<String, dynamic> json) => AttendanceSummary(
        presentDays: json['presentDays'] as int? ?? 0,
        absentDays: json['absentDays'] as int? ?? 0,
        lateDays: json['lateDays'] as int? ?? 0,
        leaveDays: json['leaveDays'] as int? ?? 0,
        workedMinutes: json['workedMinutes'] as int? ?? 0,
        lateMinutes: json['lateMinutes'] as int? ?? 0,
        approvedOvertimeMinutes: json['approvedOvertimeMinutes'] as int? ?? 0,
      );
}

/// A punch captured on the device, waiting to reach the server.
///
/// `clientPunchId` is what makes the retry safe: the server treats a replay of
/// the same id as the original punch, so a flaky connection can never turn one
/// clock-in into three.
class QueuedPunch {
  const QueuedPunch({
    required this.clientPunchId,
    required this.type,
    required this.capturedAt,
    this.latitude,
    this.longitude,
    this.accuracyM,
    this.isMockLocation = false,
    this.isRootedDevice = false,
    this.note,
  });

  final String clientPunchId;
  final String type;
  final DateTime capturedAt;
  final double? latitude;
  final double? longitude;
  final int? accuracyM;
  final bool isMockLocation;

  /// Device reported root/jailbreak when the punch was captured. Persisted so a
  /// punch queued offline on a compromised device is still flagged when it syncs.
  final bool isRootedDevice;
  final String? note;

  Map<String, dynamic> toRequestBody() => <String, dynamic>{
        'type': type,
        'method': latitude == null ? 'WEB' : 'MOBILE_GPS',
        'clientPunchId': clientPunchId,
        'clientTime': capturedAt.toUtc().toIso8601String(),
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (accuracyM != null) 'accuracyM': accuracyM,
        if (isMockLocation) 'isMockLocation': true,
        if (isRootedDevice) 'isRootedDevice': true,
        if (note != null) 'note': note,
      };

  Map<String, dynamic> toJson() => <String, dynamic>{
        'clientPunchId': clientPunchId,
        'type': type,
        'capturedAt': capturedAt.toIso8601String(),
        'latitude': latitude,
        'longitude': longitude,
        'accuracyM': accuracyM,
        'isMockLocation': isMockLocation,
        'isRootedDevice': isRootedDevice,
        'note': note,
      };

  factory QueuedPunch.fromJson(Map<String, dynamic> json) => QueuedPunch(
        clientPunchId: json['clientPunchId'] as String,
        type: json['type'] as String,
        capturedAt: DateTime.parse(json['capturedAt'] as String),
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        accuracyM: json['accuracyM'] as int?,
        isMockLocation: json['isMockLocation'] as bool? ?? false,
        isRootedDevice: json['isRootedDevice'] as bool? ?? false,
        note: json['note'] as String?,
      );
}
