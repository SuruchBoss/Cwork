// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/i18n.dart';
import '../../../core/network/error_text.dart';
import '../../../core/providers.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../../leave/application/leave_controller.dart';
import '../../leave/domain/leave_models.dart';

/// Approval inbox for managers.
///
/// Only rendered when the user holds `approval:act`; the server enforces the
/// same rule on every decision, so this is a convenience, not a control.
class ApprovalTask {
  const ApprovalTask({
    required this.id,
    required this.entityType,
    required this.submitterName,
    required this.submittedAt,
    required this.snapshot,
    this.dueAt,
  });

  final String id;
  final String entityType;
  final String submitterName;
  final DateTime submittedAt;

  /// The request's raw fields. The one-line summary is built at render time so
  /// its units follow the chosen language (CW-016).
  final Map<String, dynamic> snapshot;
  final DateTime? dueAt;

  factory ApprovalTask.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> instance = json['instance'] as Map<String, dynamic>;
    final Map<String, dynamic> submittedBy = instance['submittedBy'] as Map<String, dynamic>;
    final Map<String, dynamic>? employee = submittedBy['employee'] as Map<String, dynamic>?;

    return ApprovalTask(
      id: json['id'] as String,
      entityType: instance['entityType'] as String,
      submitterName: employee == null
          ? submittedBy['email'] as String
          : '${employee['firstNameTh']} ${employee['lastNameTh']}',
      submittedAt: DateTime.parse(instance['submittedAt'] as String),
      snapshot: instance['snapshot'] as Map<String, dynamic>? ?? const <String, dynamic>{},
      dueAt: json['dueAt'] == null ? null : DateTime.parse(json['dueAt'] as String),
    );
  }

  /// English message key for this request type; the widget runs it through
  /// `ref.tr`.
  String get typeLabelKey => switch (entityType) {
        'LEAVE_REQUEST' => 'Leave request',
        'OVERTIME_REQUEST' => 'Overtime request',
        'EXPENSE_CLAIM' => 'Expense claim',
        'ATTENDANCE_CORRECTION' => 'Attendance correction',
        'RESIGNATION' => 'Resignation',
        'DOCUMENT_REQUEST' => 'Document request',
        _ => entityType,
      };

  String summaryFor(WidgetRef ref) {
    final List<String> parts = <String>[];
    final Object? leaveTypeCode = snapshot['leaveTypeCode'];
    if (leaveTypeCode != null) {
      // The snapshot keeps the type's code (ANNUAL); show the name HR gave it.
      final List<LeaveType> types = ref.watch(leaveTypesProvider).valueOrNull ?? <LeaveType>[];
      final String code = leaveTypeCode.toString();
      parts.add(
        types
                .where((LeaveType type) => type.code == code)
                .map((LeaveType t) => t.name)
                .firstOrNull ??
            code,
      );
    }
    if (snapshot['totalDays'] != null) {
      parts.add(ref.tr('{n} days', <String, Object>{'n': snapshot['totalDays'] as Object}));
    }
    if (snapshot['hours'] != null) {
      parts.add(ref.tr('{n} hr', <String, Object>{'n': snapshot['hours'] as Object}));
    }
    if (snapshot['totalAmount'] != null) {
      parts.add(ref.tr('{n} baht', <String, Object>{'n': snapshot['totalAmount'] as Object}));
    }
    if (snapshot['startDate'] != null) parts.add(Fmt.date(snapshot['startDate']));
    if (snapshot['workDate'] != null) parts.add(Fmt.date(snapshot['workDate']));
    return parts.isEmpty ? '—' : parts.join(' · ');
  }
}

final FutureProvider<List<ApprovalTask>> approvalTasksProvider =
    FutureProvider<List<ApprovalTask>>((Ref ref) async {
  final List<dynamic> json = await ref.watch(apiClientProvider).get<List<dynamic>>(
    '/approvals/tasks',
    query: <String, dynamic>{'status': 'PENDING'},
  );
  return json.map((dynamic e) => ApprovalTask.fromJson(e as Map<String, dynamic>)).toList();
});

class ApprovalsScreen extends ConsumerWidget {
  const ApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<ApprovalTask>> tasks = ref.watch(approvalTasksProvider);

    return Scaffold(
      appBar: AppBar(title: Text(ref.tr('Pending approvals'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(approvalTasksProvider),
        child: tasks.when(
          loading: () => const LoadingList(),
          error: (Object error, StackTrace _) => ErrorView(
            error: error,
            onRetry: () => ref.invalidate(approvalTasksProvider),
          ),
          data: (List<ApprovalTask> items) {
            if (items.isEmpty) {
              return EmptyState(
                icon: Icons.task_alt,
                title: ref.tr('No pending approvals'),
                description: ref.tr('You are all caught up'),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (BuildContext _, int __) => const SizedBox(height: 10),
              itemBuilder: (BuildContext context, int index) => _ApprovalCard(task: items[index]),
            );
          },
        ),
      ),
    );
  }
}

class _ApprovalCard extends ConsumerStatefulWidget {
  const _ApprovalCard({required this.task});

  final ApprovalTask task;

  @override
  ConsumerState<_ApprovalCard> createState() => _ApprovalCardState();
}

class _ApprovalCardState extends ConsumerState<_ApprovalCard> {
  bool _busy = false;

  Future<void> _decide(String decision) async {
    // Rejecting without a reason leaves the requester guessing, so ask for one.
    String? comment;
    if (decision == 'REJECT') {
      comment = await _askReason();
      if (comment == null) return;
    }

    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).post<dynamic>(
        '/approvals/tasks/${widget.task.id}/decide',
        body: <String, dynamic>{
          'decision': decision,
          if (comment != null) 'comment': comment,
        },
      );
      ref.invalidate(approvalTasksProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              decision == 'APPROVE'
                  ? ref.tr('Approved successfully')
                  : ref.tr('Rejected successfully'),
            ),
          ),
        );
      }
    } on Object catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorText(error)),
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The reason is required, so the confirm button stays disabled until there
  /// is one and says why. It used to be enabled and do nothing when tapped
  /// with the field empty, which reads as the app not responding.
  Future<String?> _askReason() {
    final TextEditingController controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) => StatefulBuilder(
        builder: (BuildContext context, StateSetter setDialogState) {
          final bool hasReason = controller.text.trim().isNotEmpty;
          return AlertDialog(
            title: Text(ref.tr('Reason for rejection')),
            content: TextField(
              controller: controller,
              autofocus: true,
              maxLines: 3,
              onChanged: (_) => setDialogState(() {}),
              decoration: InputDecoration(
                hintText: ref.tr('Explain it to the requester'),
                helperText: ref.tr('The requester sees this reason'),
              ),
            ),
            actions: <Widget>[
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: Text(ref.tr('Back')),
              ),
              FilledButton(
                onPressed: hasReason
                    ? () => Navigator.of(dialogContext).pop(controller.text.trim())
                    : null,
                child: Text(ref.tr('Reject request')),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ApprovalTask task = widget.task;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(child: Text(task.submitterName, style: theme.textTheme.titleSmall)),
                StatusChip(label: ref.tr(task.typeLabelKey), status: 'PENDING'),
              ],
            ),
            const SizedBox(height: 6),
            Text(task.summaryFor(ref)),
            const SizedBox(height: 4),
            Text(
              ref.tr('Submitted {when}', <String, Object>{'when': Fmt.relative(task.submittedAt)}),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
            const SizedBox(height: 12),
            Row(
              children: <Widget>[
                Expanded(
                  child: OutlinedButton(
                    onPressed: _busy ? null : () => _decide('REJECT'),
                    child: Text(ref.tr('Reject')),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : () => _decide('APPROVE'),
                    child: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(ref.tr('Approve')),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
