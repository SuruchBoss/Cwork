import 'package:geolocator/geolocator.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../domain/attendance_models.dart';
import 'punch_queue.dart';

/// Why a punch could not use GPS, so the UI can explain it rather than fail
/// silently.
enum LocationIssue { disabled, denied, deniedForever, timeout }

class LocationResult {
  const LocationResult({this.position, this.issue, this.isMocked = false});

  final Position? position;
  final LocationIssue? issue;
  final bool isMocked;

  bool get hasFix => position != null;
}

class PunchOutcome {
  const PunchOutcome({required this.day, required this.queued, this.warning});

  /// Null when the punch was queued offline and the server has not seen it yet.
  final AttendanceDay? day;
  final bool queued;
  final String? warning;
}

class AttendanceRepository {
  AttendanceRepository({required ApiClient api, PunchQueue? queue})
      : _api = api,
        _queue = queue ?? PunchQueue();

  final ApiClient _api;
  final PunchQueue _queue;

  Future<AttendanceDay> today() async {
    final Map<String, dynamic> json = await _api.get<Map<String, dynamic>>('/attendance/today');
    return AttendanceDay.fromJson(json);
  }

  Future<AttendanceSummary> monthlySummary({
    required int year,
    required int month,
  }) async {
    final Map<String, dynamic> json = await _api.get<Map<String, dynamic>>(
      '/attendance/summary/me',
      query: <String, dynamic>{'year': year, 'month': month},
    );
    return AttendanceSummary.fromJson(json['summary'] as Map<String, dynamic>);
  }

  /// Sends a punch, or queues it when the device is offline.
  Future<PunchOutcome> punch({
    required String type,
    required LocationResult location,
    String? note,
  }) async {
    final QueuedPunch punch = QueuedPunch(
      clientPunchId: _generateClientPunchId(),
      type: type,
      capturedAt: DateTime.now(),
      latitude: location.position?.latitude,
      longitude: location.position?.longitude,
      accuracyM: location.position?.accuracy.round(),
      isMockLocation: location.isMocked,
      note: note,
    );

    try {
      final Map<String, dynamic> json = await _api.post<Map<String, dynamic>>(
        '/attendance/punch',
        body: punch.toRequestBody(),
      );
      return PunchOutcome(
        day: AttendanceDay.fromJson(json),
        queued: false,
        warning: _warningFor(location),
      );
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;

      await _queue.add(punch);
      return const PunchOutcome(
        day: null,
        queued: true,
        warning: 'บันทึกเวลาไว้ในเครื่องแล้ว จะส่งให้ระบบอัตโนมัติเมื่อกลับมาออนไลน์',
      );
    }
  }

  /// Flushes the offline queue. Safe to call repeatedly: the server dedupes on
  /// `clientPunchId`, and entries are only dropped once accepted.
  Future<int> flushQueue() async {
    final List<QueuedPunch> pending = await _queue.all();
    int sent = 0;

    for (final QueuedPunch punch in pending) {
      try {
        await _api.post<Map<String, dynamic>>(
          '/attendance/punch',
          body: punch.toRequestBody(),
        );
        await _queue.remove(punch.clientPunchId);
        sent += 1;
      } on ApiException catch (error) {
        if (error.isOffline) break; // Still offline; try again later.

        // A rejected punch (locked day, out-of-sequence) will never succeed, so
        // drop it rather than retrying forever.
        if (error.statusCode >= 400 && error.statusCode < 500) {
          await _queue.remove(punch.clientPunchId);
        }
      }
    }

    return sent;
  }

  Future<int> queuedCount() => _queue.count();

  /// Resolves the device's position, reporting *why* it failed rather than
  /// returning null — the employee needs to know whether to enable GPS or call HR.
  Future<LocationResult> resolveLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return const LocationResult(issue: LocationIssue.disabled);
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      return const LocationResult(issue: LocationIssue.denied);
    }
    if (permission == LocationPermission.deniedForever) {
      return const LocationResult(issue: LocationIssue.deniedForever);
    }

    try {
      final Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 12),
        ),
      );
      return LocationResult(position: position, isMocked: position.isMocked);
    } on Object {
      return const LocationResult(issue: LocationIssue.timeout);
    }
  }

  String? _warningFor(LocationResult location) {
    final Position? position = location.position;
    if (position == null) return null;
    if (position.accuracy > AppConfig.poorAccuracyMeters) {
      return 'สัญญาณ GPS ไม่แม่นยำ (±${position.accuracy.round()} ม.) ระบบจะบันทึกไว้ให้ HR ตรวจสอบ';
    }
    return null;
  }

  String _generateClientPunchId() {
    final int stamp = DateTime.now().microsecondsSinceEpoch;
    return 'p-${stamp.toRadixString(36)}';
  }
}
