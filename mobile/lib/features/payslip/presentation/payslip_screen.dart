// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/i18n.dart';
import '../../../core/providers.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../data/payslip_repository.dart';
import '../domain/payslip_models.dart';

final Provider<PayslipRepository> payslipRepositoryProvider =
    Provider<PayslipRepository>((Ref ref) => PayslipRepository(ref.watch(apiClientProvider)));

final FutureProvider<List<PayslipSummary>> myPayslipsProvider =
    FutureProvider<List<PayslipSummary>>((Ref ref) {
  return ref.watch(payslipRepositoryProvider).mine();
});

final FutureProviderFamily<PayslipDetail, String> payslipDetailProvider =
    FutureProvider.family<PayslipDetail, String>((Ref ref, String id) {
  return ref.watch(payslipRepositoryProvider).detail(id);
});

class PayslipScreen extends ConsumerWidget {
  const PayslipScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<PayslipSummary>> payslips = ref.watch(myPayslipsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(ref.tr('Payslips'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myPayslipsProvider),
        child: payslips.when(
          loading: () => const LoadingList(),
          error: (Object error, StackTrace _) => ErrorView(
            error: error,
            onRetry: () => ref.invalidate(myPayslipsProvider),
          ),
          data: (List<PayslipSummary> items) {
            if (items.isEmpty) {
              return EmptyState(
                icon: Icons.receipt_long_outlined,
                title: ref.tr('No payslips yet'),
                description: ref.tr('Slips will appear here once HR publishes a payroll run'),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (BuildContext _, int __) => const SizedBox(height: 10),
              itemBuilder: (BuildContext context, int index) {
                final PayslipSummary slip = items[index];
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    title: Row(
                      children: <Widget>[
                        Text(ref.tr('Period {code}', <String, Object>{'code': slip.periodCode})),
                        if (slip.isUnread) ...<Widget>[
                          const SizedBox(width: 8),
                          StatusChip(label: ref.tr('New'), status: 'PENDING'),
                        ],
                      ],
                    ),
                    subtitle: Text(
                      ref.tr('Paid on {date}', <String, Object>{'date': Fmt.date(slip.payDate)}),
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: <Widget>[
                        Text(
                          Fmt.money(slip.netPay),
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                        ),
                        Text(
                          ref.tr('Net'),
                          style: TextStyle(
                            fontSize: 11,
                            color: Theme.of(context).colorScheme.outline,
                          ),
                        ),
                      ],
                    ),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (BuildContext _) => PayslipDetailScreen(payslipId: slip.id),
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class PayslipDetailScreen extends ConsumerWidget {
  const PayslipDetailScreen({required this.payslipId, super.key});

  final String payslipId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<PayslipDetail> detail = ref.watch(payslipDetailProvider(payslipId));

    return Scaffold(
      appBar: AppBar(title: Text(ref.tr('Payslip details'))),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object error, StackTrace _) => ErrorView(
          error: error,
          onRetry: () => ref.invalidate(payslipDetailProvider(payslipId)),
        ),
        data: (PayslipDetail slip) => ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Text(
                    ref.tr('Period {code}', <String, Object>{'code': slip.periodCode}),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    ref.tr('Paid on {date}', <String, Object>{'date': Fmt.date(slip.payDate)}),
                    style: TextStyle(color: Theme.of(context).colorScheme.outline),
                  ),
                  const Divider(height: 24),
                  LabeledValue(
                    label: ref.tr('Gross earnings'),
                    value: Fmt.money(slip.grossEarnings),
                  ),
                  LabeledValue(
                    label: ref.tr('Total deductions'),
                    value: Fmt.money(slip.totalDeductions),
                  ),
                  const Divider(height: 20),
                  LabeledValue(
                    label: ref.tr('Net pay'),
                    value: Fmt.money(slip.netPay),
                    emphasize: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (slip.earnings.isNotEmpty)
              SectionCard(
                title: ref.tr('Earnings'),
                child: Column(children: slip.earnings.map(_itemRow).toList()),
              ),
            if (slip.deductions.isNotEmpty) ...<Widget>[
              const SizedBox(height: 12),
              SectionCard(
                title: ref.tr('Deductions'),
                child: Column(children: slip.deductions.map(_itemRow).toList()),
              ),
            ],
            if (slip.employerCosts.isNotEmpty) ...<Widget>[
              const SizedBox(height: 12),
              SectionCard(
                title: ref.tr('Employer contributions (not deducted from pay)'),
                child: Column(children: slip.employerCosts.map(_itemRow).toList()),
              ),
            ],
            const SizedBox(height: 12),
            SectionCard(
              title: ref.tr('Tax and social security'),
              child: Column(
                children: <Widget>[
                  LabeledValue(
                    label: ref.tr('Withholding tax'),
                    value: Fmt.money(slip.withholdingTax),
                  ),
                  LabeledValue(
                    label: ref.tr('Social security'),
                    value: Fmt.money(slip.ssoEmployee),
                  ),
                  LabeledValue(
                    label: ref.tr('Overtime hours paid'),
                    value: ref.tr('{n} hr', <String, Object>{'n': Fmt.number(slip.overtimeHours)}),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static Widget _itemRow(PayslipItem item) {
    final String label = item.quantity != null && item.rate != null
        ? '${item.name} (${Fmt.number(item.quantity)} × ${Fmt.money(item.rate)})'
        : item.name;
    return LabeledValue(label: label, value: Fmt.money(item.amount));
  }
}
