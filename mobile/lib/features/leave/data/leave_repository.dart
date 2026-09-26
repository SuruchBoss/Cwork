// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import '../../../core/network/api_client.dart';
import '../../../core/utils/formatters.dart';
import '../domain/leave_models.dart';

class LeaveRepository {
  const LeaveRepository(this._api);

  final ApiClient _api;

  Future<List<LeaveBalance>> balances({int? year}) async {
    final List<dynamic> json = await _api.get<List<dynamic>>(
      '/leave/balances/me',
      query: year == null ? null : <String, dynamic>{'year': year},
    );
    return json.map((dynamic e) => LeaveBalance.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<LeaveType>> types() async {
    final List<dynamic> json = await _api.get<List<dynamic>>('/leave/types');
    return json.map((dynamic e) => LeaveType.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<LeaveRequest>> myRequests() async {
    final Map<String, dynamic> json = await _api.get<Map<String, dynamic>>(
      '/leave/requests',
      query: <String, dynamic>{'limit': 50, 'sortOrder': 'desc'},
    );
    return (json['data'] as List<dynamic>)
        .map((dynamic e) => LeaveRequest.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<LeavePreview> preview({
    required String leaveTypeId,
    required DateTime startDate,
    required DateTime endDate,
    String startPortion = 'FULL',
    String endPortion = 'FULL',
  }) async {
    final Map<String, dynamic> json = await _api.post<Map<String, dynamic>>(
      '/leave/requests/preview',
      body: <String, dynamic>{
        'leaveTypeId': leaveTypeId,
        'startDate': Fmt.isoDate(startDate),
        'endDate': Fmt.isoDate(endDate),
        'startPortion': startPortion,
        'endPortion': endPortion,
      },
    );
    return LeavePreview.fromJson(json);
  }

  Future<LeaveRequest> submit({
    required String leaveTypeId,
    required DateTime startDate,
    required DateTime endDate,
    String startPortion = 'FULL',
    String endPortion = 'FULL',
    String? reason,
    String? contactPhone,
  }) async {
    final Map<String, dynamic> json = await _api.post<Map<String, dynamic>>(
      '/leave/requests',
      body: <String, dynamic>{
        'leaveTypeId': leaveTypeId,
        'startDate': Fmt.isoDate(startDate),
        'endDate': Fmt.isoDate(endDate),
        'startPortion': startPortion,
        'endPortion': endPortion,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
        if (contactPhone != null && contactPhone.isNotEmpty) 'contactPhone': contactPhone,
      },
    );
    return LeaveRequest.fromJson(json);
  }

  Future<void> cancel(String id, {String? reason}) => _api.post<dynamic>(
        '/leave/requests/$id/cancel',
        body: <String, dynamic>{if (reason != null) 'reason': reason},
      );
}
