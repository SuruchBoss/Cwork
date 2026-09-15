import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../../attendance/application/attendance_controller.dart';
import '../../attendance/domain/attendance_models.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/domain/session.dart';

final FutureProvider<Map<String, dynamic>> myEmployeeProvider =
    FutureProvider<Map<String, dynamic>>((Ref ref) {
  return ref.watch(apiClientProvider).get<Map<String, dynamic>>('/employees/me');
});

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final SessionUser? user = ref.watch(currentUserProvider);
    final AsyncValue<Map<String, dynamic>> employee = ref.watch(myEmployeeProvider);
    final AsyncValue<AttendanceSummary> summary = ref.watch(monthlySummaryProvider);
    final ThemeData theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('โปรไฟล์')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myEmployeeProvider);
          ref.invalidate(monthlySummaryProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            SectionCard(
              child: Row(
                children: <Widget>[
                  CircleAvatar(
                    radius: 30,
                    backgroundColor: theme.colorScheme.primaryContainer,
                    child: Text(
                      Fmt.initials(user?.name),
                      style: TextStyle(
                        color: theme.colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.w700,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(user?.name ?? '—', style: theme.textTheme.titleMedium),
                        Text(
                          user?.email ?? '',
                          style:
                              theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          children: (user?.roles ?? <String>[])
                              .map((String role) => StatusChip(label: role, status: 'NEUTRAL'))
                              .toList(),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            employee.when(
              loading: () => const SizedBox(
                height: 120,
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (Object error, StackTrace _) => ErrorView(
                error: error,
                onRetry: () => ref.invalidate(myEmployeeProvider),
              ),
              data: (Map<String, dynamic> data) {
                final Map<String, dynamic>? department =
                    data['department'] as Map<String, dynamic>?;
                final Map<String, dynamic>? position = data['position'] as Map<String, dynamic>?;
                final Map<String, dynamic>? manager = data['manager'] as Map<String, dynamic>?;
                final Map<String, dynamic>? location =
                    data['workLocation'] as Map<String, dynamic>?;

                return SectionCard(
                  title: 'ข้อมูลการทำงาน',
                  child: Column(
                    children: <Widget>[
                      LabeledValue(
                        label: 'รหัสพนักงาน',
                        value: data['employeeCode']?.toString() ?? '—',
                      ),
                      LabeledValue(
                        label: 'ตำแหน่ง',
                        value: position?['title']?.toString() ?? '—',
                      ),
                      LabeledValue(
                        label: 'แผนก',
                        value: department?['name']?.toString() ?? '—',
                      ),
                      LabeledValue(
                        label: 'หัวหน้างาน',
                        value: manager == null
                            ? '—'
                            : '${manager['firstNameTh']} ${manager['lastNameTh']}',
                      ),
                      LabeledValue(
                        label: 'สถานที่ทำงาน',
                        value: location?['name']?.toString() ?? '—',
                      ),
                      LabeledValue(
                        label: 'วันเริ่มงาน',
                        value: Fmt.date(data['hireDate']),
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 12),
            summary.maybeWhen(
              data: (AttendanceSummary data) => SectionCard(
                title: 'สรุปเวลาทำงานเดือนนี้',
                child: Column(
                  children: <Widget>[
                    LabeledValue(label: 'มาทำงาน', value: '${data.presentDays} วัน'),
                    LabeledValue(label: 'ลา', value: '${data.leaveDays} วัน'),
                    LabeledValue(label: 'ขาดงาน', value: '${data.absentDays} วัน'),
                    LabeledValue(
                      label: 'มาสาย',
                      value: '${data.lateDays} ครั้ง (${Fmt.minutes(data.lateMinutes)})',
                    ),
                    LabeledValue(
                      label: 'โอทีที่อนุมัติ',
                      value: Fmt.minutes(data.approvedOvertimeMinutes),
                    ),
                  ],
                ),
              ),
              orElse: () => const SizedBox.shrink(),
            ),
            const SizedBox(height: 12),
            SectionCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: <Widget>[
                  ListTile(
                    leading: const Icon(Icons.description_outlined),
                    title: const Text('ขอเอกสาร'),
                    subtitle: const Text('หนังสือรับรองการทำงาน ฯลฯ'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showDocumentRequestSheet(context, ref),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: Icon(Icons.logout, color: theme.colorScheme.error),
                    title: Text('ออกจากระบบ', style: TextStyle(color: theme.colorScheme.error)),
                    onTap: () => _confirmLogout(context, ref),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: const Text('ออกจากระบบ?'),
        content: const Text('คุณจะต้องเข้าสู่ระบบใหม่ในครั้งถัดไป'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('ยกเลิก'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('ออกจากระบบ'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }
}

const Map<String, String> _documentTypes = <String, String>{
  'EMPLOYMENT_CERTIFICATE': 'หนังสือรับรองการทำงาน',
  'SALARY_CERTIFICATE': 'หนังสือรับรองเงินเดือน',
  'TAX_WITHHOLDING_50BIS': 'หนังสือรับรองหักภาษี (50 ทวิ)',
  'VISA_SUPPORT_LETTER': 'จดหมายรับรองขอวีซ่า',
  'BANK_LOAN_LETTER': 'หนังสือรับรองขอสินเชื่อ',
};

Future<void> showDocumentRequestSheet(BuildContext context, WidgetRef ref) {
  String type = _documentTypes.keys.first;
  final TextEditingController purpose = TextEditingController();
  bool submitting = false;

  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (BuildContext sheetContext) => StatefulBuilder(
      builder: (BuildContext context, StateSetter setSheetState) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('ขอเอกสาร', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: type,
              decoration: const InputDecoration(labelText: 'ประเภทเอกสาร'),
              items: _documentTypes.entries
                  .map(
                    (MapEntry<String, String> entry) => DropdownMenuItem<String>(
                      value: entry.key,
                      child: Text(entry.value),
                    ),
                  )
                  .toList(),
              onChanged: (String? value) {
                if (value != null) setSheetState(() => type = value);
              },
            ),
            const SizedBox(height: 14),
            TextField(
              controller: purpose,
              decoration: const InputDecoration(
                labelText: 'วัตถุประสงค์',
                hintText: 'เช่น ยื่นขอวีซ่า',
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: submitting
                  ? null
                  : () async {
                      setSheetState(() => submitting = true);
                      try {
                        await ref.read(apiClientProvider).post<dynamic>(
                          '/documents/requests',
                          body: <String, dynamic>{
                            'type': type,
                            'purpose': purpose.text.trim(),
                          },
                        );
                        if (context.mounted) {
                          Navigator.of(context).pop();
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('ยื่นคำขอเอกสารเรียบร้อย HR จะแจ้งกลับเมื่อพร้อม'),
                            ),
                          );
                        }
                      } on Object catch (error) {
                        setSheetState(() => submitting = false);
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
                    },
              child: submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('ยื่นคำขอ'),
            ),
          ],
        ),
      ),
    ),
  );
}
