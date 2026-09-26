// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import '../../../core/network/api_client.dart';
import '../domain/payslip_models.dart';

class PayslipRepository {
  const PayslipRepository(this._api);

  final ApiClient _api;

  Future<List<PayslipSummary>> mine({int? year}) async {
    final List<dynamic> json = await _api.get<List<dynamic>>(
      '/payroll/payslips/me',
      query: year == null ? null : <String, dynamic>{'year': year},
    );
    return json.map((dynamic e) => PayslipSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<PayslipDetail> detail(String id) async {
    final Map<String, dynamic> json = await _api.get<Map<String, dynamic>>('/payroll/payslips/$id');
    return PayslipDetail.fromJson(json);
  }
}
