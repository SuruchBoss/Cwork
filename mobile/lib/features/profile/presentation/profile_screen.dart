// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/i18n.dart';
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
      appBar: AppBar(title: Text(ref.tr('Profile'))),
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
                  title: ref.tr('Work information'),
                  child: Column(
                    children: <Widget>[
                      LabeledValue(
                        label: ref.tr('Employee ID'),
                        value: data['employeeCode']?.toString() ?? '—',
                      ),
                      LabeledValue(
                        label: ref.tr('Position'),
                        value: position?['title']?.toString() ?? '—',
                      ),
                      LabeledValue(
                        label: ref.tr('Department'),
                        value: department?['name']?.toString() ?? '—',
                      ),
                      LabeledValue(
                        label: ref.tr('Manager'),
                        value: manager == null
                            ? '—'
                            : '${manager['firstNameTh']} ${manager['lastNameTh']}',
                      ),
                      LabeledValue(
                        label: ref.tr('Work location'),
                        value: location?['name']?.toString() ?? '—',
                      ),
                      LabeledValue(
                        label: ref.tr('Start date'),
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
                title: ref.tr('This month’s attendance summary'),
                child: Column(
                  children: <Widget>[
                    LabeledValue(
                      label: ref.tr('Present'),
                      value: ref.tr('{n} days', <String, Object>{'n': data.presentDays}),
                    ),
                    LabeledValue(
                      label: ref.tr('On leave'),
                      value: ref.tr('{n} days', <String, Object>{'n': data.leaveDays}),
                    ),
                    LabeledValue(
                      label: ref.tr('Absent'),
                      value: ref.tr('{n} days', <String, Object>{'n': data.absentDays}),
                    ),
                    LabeledValue(
                      label: ref.tr('Late'),
                      value: ref.tr('{n} times ({detail})', <String, Object>{
                        'n': data.lateDays,
                        'detail': Fmt.minutes(data.lateMinutes),
                      }),
                    ),
                    LabeledValue(
                      label: ref.tr('Approved overtime'),
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
                    leading: const Icon(Icons.translate),
                    title: Text(ref.tr('Language')),
                    trailing: DropdownButton<AppLanguage>(
                      value: ref.watch(languageProvider),
                      underline: const SizedBox.shrink(),
                      onChanged: (AppLanguage? value) {
                        if (value != null) ref.read(languageProvider.notifier).set(value);
                      },
                      items: kLanguages
                          .map(
                            (({AppLanguage value, String label}) language) =>
                                DropdownMenuItem<AppLanguage>(
                              value: language.value,
                              child: Text(language.label),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.description_outlined),
                    title: Text(ref.tr('Request a document')),
                    subtitle: Text(ref.tr('Employment certificate, etc.')),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showDocumentRequestSheet(context, ref),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: Icon(Icons.logout, color: theme.colorScheme.error),
                    title:
                        Text(ref.tr('Sign out'), style: TextStyle(color: theme.colorScheme.error)),
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
        title: Text(ref.tr('Sign out?')),
        content: Text(ref.tr('You will need to sign in again next time.')),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(ref.tr('Cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(ref.tr('Sign out')),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }
}

/// Values are English message keys (CW-016), translated at render.
const Map<String, String> _documentTypes = <String, String>{
  'EMPLOYMENT_CERTIFICATE': 'Employment certificate',
  'SALARY_CERTIFICATE': 'Salary certificate',
  'TAX_WITHHOLDING_50BIS': 'Tax withholding certificate (50 bis)',
  'VISA_SUPPORT_LETTER': 'Visa support letter',
  'BANK_LOAN_LETTER': 'Bank loan letter',
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
            Text(ref.tr('Request a document'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: type,
              decoration: InputDecoration(labelText: ref.tr('Document type')),
              items: _documentTypes.entries
                  .map(
                    (MapEntry<String, String> entry) => DropdownMenuItem<String>(
                      value: entry.key,
                      child: Text(ref.tr(entry.value)),
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
              decoration: InputDecoration(
                labelText: ref.tr('Purpose'),
                hintText: ref.tr('e.g. applying for a visa'),
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
                            SnackBar(
                              content: Text(
                                ref.tr(
                                  'Your document request has been submitted. HR will get back to you when it is ready.',
                                ),
                              ),
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
                  : Text(ref.tr('Submit request')),
            ),
          ],
        ),
      ),
    ),
  );
}
