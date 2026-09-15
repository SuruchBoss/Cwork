import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
      appBar: AppBar(title: const Text('สลิปเงินเดือน')),
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
              return const EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'ยังไม่มีสลิปเงินเดือน',
                description: 'สลิปจะปรากฏที่นี่เมื่อฝ่ายบุคคลเผยแพร่รอบเงินเดือน',
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
                        Text('งวด ${slip.periodCode}'),
                        if (slip.isUnread) ...<Widget>[
                          const SizedBox(width: 8),
                          const StatusChip(label: 'ใหม่', status: 'PENDING'),
                        ],
                      ],
                    ),
                    subtitle: Text('จ่ายวันที่ ${Fmt.date(slip.payDate)}'),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: <Widget>[
                        Text(
                          Fmt.money(slip.netPay),
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                        ),
                        Text(
                          'สุทธิ',
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
      appBar: AppBar(title: const Text('รายละเอียดสลิป')),
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
                  Text('งวด ${slip.periodCode}', style: Theme.of(context).textTheme.titleMedium),
                  Text(
                    'จ่ายวันที่ ${Fmt.date(slip.payDate)}',
                    style: TextStyle(color: Theme.of(context).colorScheme.outline),
                  ),
                  const Divider(height: 24),
                  LabeledValue(label: 'รายได้รวม', value: Fmt.money(slip.grossEarnings)),
                  LabeledValue(label: 'รายการหักรวม', value: Fmt.money(slip.totalDeductions)),
                  const Divider(height: 20),
                  LabeledValue(
                    label: 'จ่ายสุทธิ',
                    value: Fmt.money(slip.netPay),
                    emphasize: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (slip.earnings.isNotEmpty)
              SectionCard(
                title: 'รายได้',
                child: Column(children: slip.earnings.map(_itemRow).toList()),
              ),
            if (slip.deductions.isNotEmpty) ...<Widget>[
              const SizedBox(height: 12),
              SectionCard(
                title: 'รายการหัก',
                child: Column(children: slip.deductions.map(_itemRow).toList()),
              ),
            ],
            if (slip.employerCosts.isNotEmpty) ...<Widget>[
              const SizedBox(height: 12),
              SectionCard(
                title: 'นายจ้างสมทบ (ไม่หักจากเงินเดือน)',
                child: Column(children: slip.employerCosts.map(_itemRow).toList()),
              ),
            ],
            const SizedBox(height: 12),
            SectionCard(
              title: 'ข้อมูลภาษีและประกันสังคม',
              child: Column(
                children: <Widget>[
                  LabeledValue(
                    label: 'ภาษีหัก ณ ที่จ่าย',
                    value: Fmt.money(slip.withholdingTax),
                  ),
                  LabeledValue(label: 'ประกันสังคม', value: Fmt.money(slip.ssoEmployee)),
                  LabeledValue(
                    label: 'ชั่วโมงโอทีที่จ่าย',
                    value: '${Fmt.number(slip.overtimeHours)} ชม.',
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
