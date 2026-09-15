class PayslipSummary {
  const PayslipSummary({
    required this.id,
    required this.currency,
    required this.grossEarnings,
    required this.totalDeductions,
    required this.netPay,
    required this.periodCode,
    required this.payDate,
    this.viewedAt,
  });

  final String id;
  final String currency;
  final String grossEarnings;
  final String totalDeductions;
  final String netPay;
  final String periodCode;
  final DateTime? payDate;
  final DateTime? viewedAt;

  factory PayslipSummary.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic>? run = json['run'] as Map<String, dynamic>?;
    final Map<String, dynamic>? period = run?['period'] as Map<String, dynamic>?;
    return PayslipSummary(
      id: json['id'] as String,
      currency: json['currency'] as String? ?? 'THB',
      grossEarnings: json['grossEarnings'].toString(),
      totalDeductions: json['totalDeductions'].toString(),
      netPay: json['netPay'].toString(),
      periodCode: period?['code'] as String? ?? '—',
      payDate: period?['payDate'] == null ? null : DateTime.parse(period!['payDate'] as String),
      viewedAt: json['viewedAt'] == null ? null : DateTime.parse(json['viewedAt'] as String),
    );
  }

  bool get isUnread => viewedAt == null;
}

class PayslipItem {
  const PayslipItem({
    required this.name,
    required this.type,
    required this.amount,
    this.quantity,
    this.rate,
  });

  final String name;
  final String type;
  final String amount;
  final String? quantity;
  final String? rate;

  factory PayslipItem.fromJson(Map<String, dynamic> json) => PayslipItem(
        name: json['name'] as String,
        type: json['type'] as String,
        amount: json['amount'].toString(),
        quantity: json['quantity']?.toString(),
        rate: json['rate']?.toString(),
      );

  bool get isEarning => type == 'EARNING';
  bool get isDeduction => type == 'DEDUCTION';
  bool get isEmployerCost => type == 'EMPLOYER_CONTRIBUTION';
  bool get isInformational => type == 'INFORMATIONAL';
}

class PayslipDetail {
  const PayslipDetail({
    required this.id,
    required this.currency,
    required this.periodCode,
    required this.grossEarnings,
    required this.totalDeductions,
    required this.netPay,
    required this.withholdingTax,
    required this.ssoEmployee,
    required this.overtimeHours,
    required this.items,
    this.payDate,
  });

  final String id;
  final String currency;
  final String periodCode;
  final String grossEarnings;
  final String totalDeductions;
  final String netPay;
  final String withholdingTax;
  final String ssoEmployee;
  final String overtimeHours;
  final List<PayslipItem> items;
  final DateTime? payDate;

  factory PayslipDetail.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic>? run = json['run'] as Map<String, dynamic>?;
    final Map<String, dynamic>? period = run?['period'] as Map<String, dynamic>?;
    return PayslipDetail(
      id: json['id'] as String,
      currency: json['currency'] as String? ?? 'THB',
      periodCode: period?['code'] as String? ?? '—',
      grossEarnings: json['grossEarnings'].toString(),
      totalDeductions: json['totalDeductions'].toString(),
      netPay: json['netPay'].toString(),
      withholdingTax: json['withholdingTax'].toString(),
      ssoEmployee: json['ssoEmployee'].toString(),
      overtimeHours: json['overtimeHours'].toString(),
      payDate: period?['payDate'] == null ? null : DateTime.parse(period!['payDate'] as String),
      items: (json['items'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic e) => PayslipItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  List<PayslipItem> get earnings => items.where((PayslipItem item) => item.isEarning).toList();

  List<PayslipItem> get deductions => items.where((PayslipItem item) => item.isDeduction).toList();

  List<PayslipItem> get employerCosts =>
      items.where((PayslipItem item) => item.isEmployerCost).toList();
}
