import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../application/leave_controller.dart';
import '../domain/leave_models.dart';
import 'leave_request_sheet.dart';

class LeaveScreen extends ConsumerWidget {
  const LeaveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<LeaveRequest>> requests = ref.watch(myLeaveRequestsProvider);
    final AsyncValue<List<LeaveBalance>> balances = ref.watch(leaveBalancesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('การลา')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showLeaveRequestSheet(context),
        icon: const Icon(Icons.add),
        label: const Text('ขอลา'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myLeaveRequestsProvider);
          ref.invalidate(leaveBalancesProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
          children: <Widget>[
            balances.maybeWhen(
              data: (List<LeaveBalance> items) => _BalanceStrip(balances: items),
              orElse: () => const SizedBox.shrink(),
            ),
            const SizedBox(height: 16),
            Text('คำขอลาของฉัน', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            requests.when(
              loading: () => const LoadingList(itemCount: 3),
              error: (Object error, StackTrace _) => ErrorView(
                error: error,
                onRetry: () => ref.invalidate(myLeaveRequestsProvider),
              ),
              data: (List<LeaveRequest> items) {
                if (items.isEmpty) {
                  return const EmptyState(
                    icon: Icons.beach_access_outlined,
                    title: 'ยังไม่มีคำขอลา',
                    description: 'กดปุ่ม “ขอลา” เพื่อยื่นคำขอแรกของคุณ',
                  );
                }
                return Column(
                  children: items
                      .map(
                        (LeaveRequest request) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _LeaveRequestTile(request: request),
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _BalanceStrip extends StatelessWidget {
  const _BalanceStrip({required this.balances});

  final List<LeaveBalance> balances;

  @override
  Widget build(BuildContext context) {
    final List<LeaveBalance> visible = balances.where((LeaveBalance b) => b.granted > 0).toList();
    if (visible.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: visible.length,
        separatorBuilder: (BuildContext _, int __) => const SizedBox(width: 10),
        itemBuilder: (BuildContext context, int index) {
          final LeaveBalance balance = visible[index];
          return Container(
            width: 132,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: Color(balance.color),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        balance.name,
                        style: const TextStyle(fontSize: 12),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                Text(
                  Fmt.number(balance.available),
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                ),
                Text(
                  'จาก ${Fmt.number(balance.granted)} วัน',
                  style: TextStyle(
                    fontSize: 11,
                    color: Theme.of(context).colorScheme.outline,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LeaveRequestTile extends ConsumerWidget {
  const _LeaveRequestTile({required this.request});

  final LeaveRequest request;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: Color(_colorOf(request.colorHex)),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    request.leaveTypeName,
                    style: theme.textTheme.titleSmall,
                  ),
                ),
                StatusChip(label: _statusLabel(request.status), status: request.status),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              request.startDate == request.endDate
                  ? Fmt.date(request.startDate)
                  : '${Fmt.date(request.startDate)} – ${Fmt.date(request.endDate)}',
            ),
            Text(
              '${Fmt.number(request.totalDays)} วัน · ${request.requestNo}',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
            if (request.reason != null && request.reason!.isNotEmpty) ...<Widget>[
              const SizedBox(height: 6),
              Text(request.reason!, style: theme.textTheme.bodySmall),
            ],
            if (request.createdViaAssistant) ...<Widget>[
              const SizedBox(height: 8),
              Row(
                children: <Widget>[
                  Icon(Icons.auto_awesome, size: 14, color: theme.colorScheme.primary),
                  const SizedBox(width: 4),
                  Text(
                    'ยื่นผ่านผู้ช่วย HR',
                    style: TextStyle(fontSize: 12, color: theme.colorScheme.primary),
                  ),
                ],
              ),
            ],
            if (request.isCancellable) ...<Widget>[
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => _confirmCancel(context, ref),
                  icon: const Icon(Icons.close, size: 16),
                  label: const Text('ยกเลิกคำขอ'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: const Text('ยกเลิกคำขอลา?'),
        content: Text('${request.leaveTypeName} ${Fmt.date(request.startDate)}'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('ไม่ใช่'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('ยกเลิกคำขอ'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(leaveRepositoryProvider).cancel(request.id);
      ref.invalidate(myLeaveRequestsProvider);
      ref.invalidate(leaveBalancesProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('ยกเลิกคำขอลาแล้ว')));
      }
    } on Object catch (error) {
      if (context.mounted) {
        final String raw = error.toString();
        final int separator = raw.indexOf(': ');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(separator >= 0 ? raw.substring(separator + 2) : raw),
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    }
  }

  static int _colorOf(String hex) =>
      int.tryParse('FF${hex.replaceFirst('#', '')}', radix: 16) ?? 0xFF2563EB;

  static String _statusLabel(String status) => switch (status) {
        'DRAFT' => 'ฉบับร่าง',
        'PENDING' => 'รออนุมัติ',
        'APPROVED' => 'อนุมัติแล้ว',
        'REJECTED' => 'ไม่อนุมัติ',
        'CANCELLED' => 'ยกเลิก',
        'CANCELLED_AFTER_APPROVAL' => 'ยกเลิกหลังอนุมัติ',
        _ => status,
      };
}
