import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../../attendance/application/attendance_controller.dart';
import '../../attendance/domain/attendance_models.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/domain/session.dart';
import '../../leave/application/leave_controller.dart';
import '../../leave/domain/leave_models.dart';

/// Home: the clock-in card first, because that is what people open the app for.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final SessionUser? user = ref.watch(currentUserProvider);
    final AsyncValue<AttendanceDay> today = ref.watch(todayAttendanceProvider);
    final AsyncValue<List<LeaveBalance>> balances = ref.watch(leaveBalancesProvider);
    final AsyncValue<int> queued = ref.watch(queuedPunchCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Text('สวัสดี ${user?.name ?? ''}', style: const TextStyle(fontSize: 16)),
            Text(
              Fmt.date(DateTime.now()),
              style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline),
            ),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(todayAttendanceProvider);
          ref.invalidate(leaveBalancesProvider);
          await ref.read(attendanceControllerProvider.notifier).flushQueue();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            queued.maybeWhen(
              data: (int count) => count > 0
                  ? Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _OfflineBanner(count: count),
                    )
                  : const SizedBox.shrink(),
              orElse: () => const SizedBox.shrink(),
            ),
            ClockCard(day: today),
            const SizedBox(height: 12),
            _LeaveBalanceCard(balances: balances),
            const SizedBox(height: 12),
            _TodayDetailCard(day: today),
          ],
        ),
      ),
    );
  }
}

class _OfflineBanner extends ConsumerWidget {
  const _OfflineBanner({required this.count});

  final int count;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: <Widget>[
          Icon(Icons.cloud_off, size: 18, color: theme.colorScheme.onSecondaryContainer),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'มีการลงเวลา $count รายการรอส่ง จะส่งอัตโนมัติเมื่อกลับมาออนไลน์',
              style: TextStyle(color: theme.colorScheme.onSecondaryContainer, fontSize: 13),
            ),
          ),
          TextButton(
            onPressed: () => ref.read(attendanceControllerProvider.notifier).flushQueue(),
            child: const Text('ส่งเลย'),
          ),
        ],
      ),
    );
  }
}

/// The primary action of the whole app.
class ClockCard extends ConsumerWidget {
  const ClockCard({required this.day, super.key});

  final AsyncValue<AttendanceDay> day;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    final PunchState punch = ref.watch(attendanceControllerProvider);

    ref.listen<PunchState>(attendanceControllerProvider, (PunchState? _, PunchState next) {
      final String? message = next.message;
      if (message == null) return;

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(message),
            backgroundColor: next.isError ? theme.colorScheme.error : null,
          ),
        );
      ref.read(attendanceControllerProvider.notifier).clearMessage();
    });

    return day.when(
      loading: () => const Card(
        child: SizedBox(height: 210, child: Center(child: CircularProgressIndicator())),
      ),
      error: (Object error, StackTrace _) => Card(
        child: SizedBox(
          height: 210,
          child: ErrorView(
            error: error,
            onRetry: () => ref.invalidate(todayAttendanceProvider),
          ),
        ),
      ),
      data: (AttendanceDay data) {
        final bool clockedIn = data.isClockedIn;
        final AttendanceRecord? record = data.record;
        final bool locked = record?.isLocked ?? false;

        return SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Icon(
                    clockedIn ? Icons.work_history : Icons.schedule,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      clockedIn ? 'กำลังทำงานอยู่' : 'ยังไม่ได้ลงเวลาเข้างาน',
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  if (record != null)
                    StatusChip(
                      label: _statusLabel(record.status),
                      status: record.status,
                    ),
                ],
              ),
              if (data.shift != null) ...<Widget>[
                const SizedBox(height: 6),
                Text(
                  '${data.shift!.name} · ${data.shift!.startTime}–${data.shift!.endTime}',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
              const SizedBox(height: 16),
              Row(
                children: <Widget>[
                  Expanded(
                    child: _TimeBlock(
                      label: 'เข้างาน',
                      value: Fmt.time(record?.firstClockInAt),
                    ),
                  ),
                  Expanded(
                    child: _TimeBlock(
                      label: 'ออกงาน',
                      value: Fmt.time(record?.lastClockOutAt),
                    ),
                  ),
                  Expanded(
                    child: _TimeBlock(
                      label: 'ทำงาน',
                      value: Fmt.minutes(record?.workedMinutes),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: punch.isBusy || locked
                    ? null
                    : () => ref
                        .read(attendanceControllerProvider.notifier)
                        .punch(clockedIn ? 'CLOCK_OUT' : 'CLOCK_IN'),
                icon: punch.isBusy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(clockedIn ? Icons.logout : Icons.login),
                label: Text(
                  locked
                      ? 'ปิดรอบเงินเดือนแล้ว'
                      : clockedIn
                          ? 'ลงเวลาออกงาน'
                          : 'ลงเวลาเข้างาน',
                ),
                style: clockedIn
                    ? FilledButton.styleFrom(backgroundColor: theme.colorScheme.tertiary)
                    : null,
              ),
              if (record != null && record.lateMinutes > 0) ...<Widget>[
                const SizedBox(height: 10),
                Text(
                  'มาสาย ${record.lateMinutes} นาที',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  static String _statusLabel(String status) => switch (status) {
        'PRESENT' => 'มาทำงาน',
        'LATE' => 'มาสาย',
        'EARLY_LEAVE' => 'ออกก่อนเวลา',
        'ABSENT' => 'ขาดงาน',
        'ON_LEAVE' => 'ลา',
        'HOLIDAY' => 'วันหยุด',
        'DAY_OFF' => 'วันหยุดประจำสัปดาห์',
        'INCOMPLETE' => 'ลงเวลาไม่ครบ',
        _ => 'ยังไม่ลงเวลา',
      };
}

class _TimeBlock extends StatelessWidget {
  const _TimeBlock({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Column(
      children: <Widget>[
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
        ),
        const SizedBox(height: 2),
        Text(value, style: theme.textTheme.titleMedium),
      ],
    );
  }
}

class _LeaveBalanceCard extends StatelessWidget {
  const _LeaveBalanceCard({required this.balances});

  final AsyncValue<List<LeaveBalance>> balances;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'วันลาคงเหลือ',
      child: balances.when(
        loading: () =>
            const SizedBox(height: 60, child: Center(child: CircularProgressIndicator())),
        error: (Object error, StackTrace _) => ErrorView(error: error),
        data: (List<LeaveBalance> items) {
          final List<LeaveBalance> visible =
              items.where((LeaveBalance b) => b.granted > 0 || b.used > 0).toList();

          if (visible.isEmpty) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('ยังไม่มีสิทธิ์วันลาในปีนี้'),
            );
          }

          return Column(
            children: visible
                .map(
                  (LeaveBalance balance) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      children: <Widget>[
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: Color(balance.color),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Text(balance.name)),
                        if (balance.pending > 0)
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: Text(
                              'รอ ${Fmt.number(balance.pending)}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Theme.of(context).colorScheme.outline,
                              ),
                            ),
                          ),
                        Text(
                          '${Fmt.number(balance.available)} วัน',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                )
                .toList(),
          );
        },
      ),
    );
  }
}

class _TodayDetailCard extends StatelessWidget {
  const _TodayDetailCard({required this.day});

  final AsyncValue<AttendanceDay> day;

  @override
  Widget build(BuildContext context) {
    return day.maybeWhen(
      data: (AttendanceDay data) {
        if (data.punches.isEmpty) return const SizedBox.shrink();

        return SectionCard(
          title: 'การลงเวลาวันนี้',
          child: Column(
            children: data.punches
                .map(
                  (AttendancePunch punch) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: Icon(
                      punch.type == 'CLOCK_IN' ? Icons.login : Icons.logout,
                      size: 20,
                    ),
                    title: Text(
                      punch.type == 'CLOCK_IN' ? 'เข้างาน' : 'ออกงาน',
                    ),
                    subtitle: Text(
                      <String>[
                        Fmt.time(punch.punchedAt),
                        if (punch.workLocationName != null) punch.workLocationName!,
                        if (punch.distanceM != null) 'ห่าง ${punch.distanceM} ม.',
                      ].join(' · '),
                    ),
                    trailing: punch.isOutsideGeofence
                        ? const StatusChip(label: 'นอกพื้นที่', status: 'PENDING')
                        : null,
                  ),
                )
                .toList(),
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}
