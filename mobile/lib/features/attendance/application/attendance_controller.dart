import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/attendance_repository.dart';
import '../domain/attendance_models.dart';

final Provider<AttendanceRepository> attendanceRepositoryProvider =
    Provider<AttendanceRepository>((Ref ref) {
  return AttendanceRepository(api: ref.watch(apiClientProvider));
});

/// Today's attendance. Kept as a separate provider from the punch action so a
/// failed punch does not blank the card the user is looking at.
final FutureProvider<AttendanceDay> todayAttendanceProvider =
    FutureProvider<AttendanceDay>((Ref ref) {
  return ref.watch(attendanceRepositoryProvider).today();
});

final FutureProvider<AttendanceSummary> monthlySummaryProvider =
    FutureProvider<AttendanceSummary>((Ref ref) {
  final DateTime now = DateTime.now();
  return ref.watch(attendanceRepositoryProvider).monthlySummary(year: now.year, month: now.month);
});

final StreamProvider<int> queuedPunchCountProvider = StreamProvider<int>((Ref ref) async* {
  final AttendanceRepository repository = ref.watch(attendanceRepositoryProvider);
  yield await repository.queuedCount();

  // Re-check whenever connectivity changes: that is when a flush is likely to
  // have drained the queue.
  await for (final List<ConnectivityResult> _ in Connectivity().onConnectivityChanged) {
    await repository.flushQueue();
    yield await repository.queuedCount();
  }
});

class PunchState {
  const PunchState({this.isBusy = false, this.message, this.isError = false});

  final bool isBusy;
  final String? message;
  final bool isError;
}

class AttendanceController extends StateNotifier<PunchState> {
  AttendanceController(this._ref) : super(const PunchState());

  final Ref _ref;

  AttendanceRepository get _repository => _ref.read(attendanceRepositoryProvider);

  Future<void> punch(String type) async {
    state = const PunchState(isBusy: true);

    try {
      final LocationResult location = await _repository.resolveLocation();

      // A missing GPS fix does not block the punch: the server records it,
      // flags it, and HR decides. Refusing to clock someone in because their
      // phone could not see a satellite is worse than a flagged record.
      final PunchOutcome outcome = await _repository.punch(
        type: type,
        location: location,
        note: _noteFor(location.issue),
      );

      _ref.invalidate(todayAttendanceProvider);
      _ref.invalidate(monthlySummaryProvider);

      state = PunchState(
        message: outcome.warning ??
            (type == 'CLOCK_IN' ? 'บันทึกเวลาเข้างานเรียบร้อย' : 'บันทึกเวลาออกงานเรียบร้อย'),
      );
    } on Object catch (error) {
      state = PunchState(message: _describe(error), isError: true);
    }
  }

  Future<void> flushQueue() async {
    final int sent = await _repository.flushQueue();
    if (sent > 0) {
      _ref.invalidate(todayAttendanceProvider);
      state = PunchState(message: 'ส่งเวลาที่บันทึกไว้ $sent รายการเรียบร้อย');
    }
  }

  void clearMessage() => state = const PunchState();

  String? _noteFor(LocationIssue? issue) => switch (issue) {
        LocationIssue.disabled => 'ปิดบริการตำแหน่งที่ตั้งบนอุปกรณ์',
        LocationIssue.denied => 'ไม่ได้อนุญาตให้เข้าถึงตำแหน่ง',
        LocationIssue.deniedForever => 'ปฏิเสธสิทธิ์ตำแหน่งถาวร',
        LocationIssue.timeout => 'หาตำแหน่งไม่สำเร็จภายในเวลาที่กำหนด',
        null => null,
      };

  String _describe(Object error) {
    final String message = error.toString();
    // ApiException.toString() already carries the server's Thai message.
    final int separator = message.indexOf(': ');
    return separator >= 0 ? message.substring(separator + 2) : message;
  }
}

final StateNotifierProvider<AttendanceController, PunchState> attendanceControllerProvider =
    StateNotifierProvider<AttendanceController, PunchState>((Ref ref) {
  return AttendanceController(ref);
});
