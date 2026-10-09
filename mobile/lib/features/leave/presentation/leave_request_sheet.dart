// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/i18n.dart';
import '../../../core/network/error_text.dart';
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

  bool get _singleDay => _startDate != null && _startDate == _endDate;

  /// Half days are offered only where they can apply: one day, of a type that
  /// allows them. Offering them on a week-long request, or for a type the
  /// server then refuses, was a choice the person could only get wrong.
  bool _halfDayOffered(LeaveType? type) => _singleDay && (type?.allowHalfDay ?? false);

  /// Two plain date fields instead of a range picker. In the range picker,
  /// "Save" stays disabled until an end date is tapped, so someone taking one
  /// day off tapped that day, found the button dead and was stuck; the way out
  /// (tap the same day twice) is not something anyone guesses. The end date
  /// now starts as the start date, so one day off is one tap.
  Future<void> _pickStart() async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _startDate ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 60)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      helpText: ref.tr('First day of leave'),
    );
    if (picked == null) return;
    setState(() {
      final bool wasSingleDay = _singleDay || _endDate == null;
      _startDate = picked;
      if (wasSingleDay || _endDate!.isBefore(picked)) _endDate = picked;
      if (!_singleDay) _startPortion = 'FULL';
      _preview = null;
    });
    await _refreshPreview();
  }

  Future<void> _pickEnd() async {
    if (_startDate == null) return _pickStart();
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _endDate ?? _startDate!,
      firstDate: _startDate!,
      lastDate: DateTime.now().add(const Duration(days: 365)),
      helpText: ref.tr('Last day of leave'),
    );
    if (picked == null) return;
    setState(() {
      _endDate = picked;
      if (!_singleDay) _startPortion = 'FULL';
      _preview = null;
    });
    await _refreshPreview();
  }

  /// Why "Submit" is disabled, in the words of the step still missing.
  String? _missingStep() {
    if (_leaveTypeId == null) return ref.tr('Choose a leave type');
    if (_startDate == null) return ref.tr('Choose the day your leave starts');
    if (_previewing) return null;
    if (_preview != null && _preview!.totalDays <= 0) {
      return ref.tr('The days you picked are all days off. Pick at least one working day');
    }
    return null;
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

  String _describe(Object error) => errorText(error);

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
        // The form scrolls; the button, and anything that stops it, does not.
        // With the summary card open the button sat below the fold, so a
        // first-time user saw neither it nor the reason their request failed.
        builder: (BuildContext context, ScrollController controller) => Column(
          children: <Widget>[
            Expanded(
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
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
                          final LeaveType? type = _typeById(items, value);
                          if (!_halfDayOffered(type)) _startPortion = 'FULL';
                          _preview = null;
                        });
                        _refreshPreview();
                      },
                    ),
                  ),
                  const SizedBox(height: 14),
                  _DateField(
                    label: ref.tr('First day of leave'),
                    value: _startDate == null ? ref.tr('Select a date') : Fmt.date(_startDate),
                    onTap: _pickStart,
                  ),
                  const SizedBox(height: 14),
                  _DateField(
                    label: ref.tr('Until'),
                    value: _endDate == null
                        ? ref.tr('Select a date')
                        : _singleDay
                            ? ref.tr(
                                '{date} (one day)',
                                <String, Object>{'date': Fmt.date(_endDate)},
                              )
                            : Fmt.date(_endDate),
                    onTap: _pickEnd,
                  ),
                  if (_halfDayOffered(_typeById(types.valueOrNull, _leaveTypeId))) ...<Widget>[
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
                  ],
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
                ],
              ),
            ),
            _SubmitBar(
              error: _error,
              hint: _submitting ? null : _missingStep(),
              submitting: _submitting,
              onSubmit:
                  _submitting || !_canPreview || (_preview?.totalDays ?? 0) <= 0 ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}

LeaveType? _typeById(List<LeaveType>? types, String? id) {
  if (types == null || id == null) return null;
  for (final LeaveType type in types) {
    if (type.id == id) return type;
  }
  return null;
}

/// A tappable field that opens a date picker, styled like the other fields.
class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onTap});

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: const Icon(Icons.calendar_today_outlined),
        ),
        child: Text(value),
      ),
    );
  }
}

/// The foot of the request sheet: what went wrong, the button, and what is
/// still missing before it can be pressed.
class _SubmitBar extends ConsumerWidget {
  const _SubmitBar({
    required this.error,
    required this.hint,
    required this.submitting,
    required this.onSubmit,
  });

  final String? error;
  final String? hint;
  final bool submitting;
  final VoidCallback? onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      elevation: 3,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (error != null) ...<Widget>[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.errorContainer,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    error!,
                    style: TextStyle(color: theme.colorScheme.onErrorContainer),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              FilledButton(
                onPressed: onSubmit,
                child: submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(ref.tr('Submit request')),
              ),
              if (hint != null) ...<Widget>[
                const SizedBox(height: 8),
                Text(
                  hint!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ],
          ),
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
            value: ref.tr('{n} days', <String, Object>{'n': Fmt.days(preview.totalDays)}),
            emphasize: true,
          ),
          LabeledValue(
            label: ref.tr('Balance before'),
            value: ref.tr('{n} days', <String, Object>{'n': Fmt.days(preview.balanceBefore)}),
          ),
          LabeledValue(
            label: ref.tr('Balance after'),
            value: ref.tr('{n} days', <String, Object>{'n': Fmt.days(preview.balanceAfter)}),
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
