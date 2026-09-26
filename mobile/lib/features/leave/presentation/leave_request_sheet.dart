// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/i18n.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../application/leave_controller.dart';
import '../domain/leave_models.dart';

Future<void> showLeaveRequestSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (BuildContext sheetContext) => const LeaveRequestSheet(),
  );
}

/// Request form with a live cost preview.
///
/// The preview is the point: it calls the same server-side calculation payroll
/// uses, so the employee sees exactly which days are charged before they commit
/// — weekends and public holidays already excluded.
class LeaveRequestSheet extends ConsumerStatefulWidget {
  const LeaveRequestSheet({super.key});

  @override
  ConsumerState<LeaveRequestSheet> createState() => _LeaveRequestSheetState();
}

class _LeaveRequestSheetState extends ConsumerState<LeaveRequestSheet> {
  final TextEditingController _reason = TextEditingController();

  String? _leaveTypeId;
  DateTime? _startDate;
  DateTime? _endDate;
  String _startPortion = 'FULL';

  LeavePreview? _preview;
  bool _previewing = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  bool get _canPreview => _leaveTypeId != null && _startDate != null && _endDate != null;

  Future<void> _pickRange() async {
    final DateTimeRange? range = await showDateRangePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 60)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDateRange: _startDate != null && _endDate != null
          ? DateTimeRange(start: _startDate!, end: _endDate!)
          : null,
      helpText: ref.tr('Select your leave dates'),
    );

    if (range == null) return;
    setState(() {
      _startDate = range.start;
      _endDate = range.end;
      _preview = null;
    });
    await _refreshPreview();
  }

  Future<void> _refreshPreview() async {
    if (!_canPreview) return;

    setState(() {
      _previewing = true;
      _error = null;
    });

    try {
      final LeavePreview preview = await ref.read(leaveRepositoryProvider).preview(
            leaveTypeId: _leaveTypeId!,
            startDate: _startDate!,
            endDate: _endDate!,
            startPortion: _startPortion,
            endPortion: _startPortion == 'FULL' ? 'FULL' : 'FULL',
          );
      if (mounted) setState(() => _preview = preview);
    } on Object catch (error) {
      if (mounted) setState(() => _error = _describe(error));
    } finally {
      if (mounted) setState(() => _previewing = false);
    }
  }

  Future<void> _submit() async {
    if (!_canPreview) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(leaveRepositoryProvider).submit(
            leaveTypeId: _leaveTypeId!,
            startDate: _startDate!,
            endDate: _endDate!,
            startPortion: _startPortion,
            reason: _reason.text.trim(),
          );

      ref.invalidate(myLeaveRequestsProvider);
      ref.invalidate(leaveBalancesProvider);

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(ref.tr('Your leave request has been submitted and is awaiting approval')),
          ),
        );
      }
    } on Object catch (error) {
      if (mounted) setState(() => _error = _describe(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _describe(Object error) {
    final String raw = error.toString();
    final int separator = raw.indexOf(': ');
    return separator >= 0 ? raw.substring(separator + 2) : raw;
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AsyncValue<List<LeaveType>> types = ref.watch(leaveTypesProvider);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (BuildContext context, ScrollController controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    ref.tr('File a leave request'),
                    style: theme.textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 16),
            types.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (Object error, StackTrace _) => ErrorView(error: error),
              data: (List<LeaveType> items) => DropdownButtonFormField<String>(
                initialValue: _leaveTypeId,
                decoration: InputDecoration(labelText: ref.tr('Leave type')),
                items: items
                    .map(
                      (LeaveType type) => DropdownMenuItem<String>(
                        value: type.id,
                        child: Text(
                          type.isPaid ? type.name : '${type.name} (${ref.tr('unpaid')})',
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (String? value) {
                  setState(() {
                    _leaveTypeId = value;
                    _preview = null;
                  });
                  _refreshPreview();
                },
              ),
            ),
            const SizedBox(height: 14),
            InkWell(
              onTap: _pickRange,
              borderRadius: BorderRadius.circular(10),
              child: InputDecorator(
                decoration: InputDecoration(
                  labelText: ref.tr('Leave dates'),
                  prefixIcon: const Icon(Icons.calendar_today_outlined),
                ),
                child: Text(
                  _startDate == null
                      ? ref.tr('Select a date')
                      : _startDate == _endDate
                          ? Fmt.date(_startDate)
                          : '${Fmt.date(_startDate)} – ${Fmt.date(_endDate)}',
                ),
              ),
            ),
            const SizedBox(height: 14),
            SegmentedButton<String>(
              segments: <ButtonSegment<String>>[
                ButtonSegment<String>(value: 'FULL', label: Text(ref.tr('Full day'))),
                ButtonSegment<String>(value: 'MORNING', label: Text(ref.tr('Morning'))),
                ButtonSegment<String>(value: 'AFTERNOON', label: Text(ref.tr('Afternoon'))),
              ],
              selected: <String>{_startPortion},
              onSelectionChanged: (Set<String> selection) {
                setState(() {
                  _startPortion = selection.first;
                  _preview = null;
                });
                _refreshPreview();
              },
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _reason,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: ref.tr('Reason (optional)'),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 18),
            if (_previewing)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_preview != null)
              _PreviewCard(preview: _preview!),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _error!,
                  style: TextStyle(color: theme.colorScheme.onErrorContainer),
                ),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed:
                  _submitting || !_canPreview || (_preview?.totalDays ?? 0) <= 0 ? null : _submit,
              child: _submitting
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
    );
  }
}

class _PreviewCard extends ConsumerWidget {
  const _PreviewCard({required this.preview});

  final LeavePreview preview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    final bool insufficient = preview.balanceAfter < 0;

    return SectionCard(
      title: ref.tr('Before you submit'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          LabeledValue(
            label: ref.tr('Days charged'),
            value: ref.tr('{n} days', <String, Object>{'n': Fmt.number(preview.totalDays)}),
            emphasize: true,
          ),
          LabeledValue(
            label: ref.tr('Balance before'),
            value: ref.tr('{n} days', <String, Object>{'n': Fmt.number(preview.balanceBefore)}),
          ),
          LabeledValue(
            label: ref.tr('Balance after'),
            value: ref.tr('{n} days', <String, Object>{'n': Fmt.number(preview.balanceAfter)}),
          ),
          if (preview.chargedDates.isNotEmpty) ...<Widget>[
            const Divider(height: 20),
            Text(
              ref.tr('Charged dates (excluding weekends and public holidays)'),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: preview.chargedDates
                  .map(
                    (String date) => Chip(
                      label: Text(Fmt.dateShort(date), style: const TextStyle(fontSize: 12)),
                      visualDensity: VisualDensity.compact,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  )
                  .toList(),
            ),
          ],
          if (preview.totalDays == 0) ...<Widget>[
            const SizedBox(height: 10),
            Text(
              ref.tr('The selected range has no working days, so no leave is charged'),
              style: TextStyle(color: theme.colorScheme.outline),
            ),
          ],
          if (insufficient || preview.warnings.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            ...preview.warnings.map(
              (String warning) => Row(
                children: <Widget>[
                  Icon(Icons.warning_amber, size: 16, color: theme.colorScheme.error),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(warning, style: TextStyle(color: theme.colorScheme.error)),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
