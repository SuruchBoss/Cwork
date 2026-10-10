// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:cwork/core/network/api_exception.dart';
import 'package:cwork/core/network/error_text.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('th');
  });

  ApiException failure(String code, [Map<String, Object?>? details]) => ApiException(
        statusCode: 422,
        code: code,
        message: 'ลาพักร้อน requires 3 days of notice',
        details: details,
      );

  group('errorText', () {
    test('words a leave rule in Thai instead of the server’s English', () {
      final String text = errorText(
        failure('LEAVE_NOTICE_TOO_SHORT', <String, Object?>{'noticeDays': 1, 'requiredDays': 3}),
      );
      expect(text, contains('ล่วงหน้าอย่างน้อย 3 วัน'));
      expect(text, isNot(contains('requires')));
    });

    test('fills the balance figures in whole and half days', () {
      final String text = errorText(
        failure('INSUFFICIENT_LEAVE_BALANCE', <String, Object?>{'available': 2, 'requested': 2.5}),
      );
      expect(text, contains('เหลือ 2 วัน'));
      expect(text, contains('ใช้ 2.5 วัน'));
    });

    test('names the dates an overlapping request already covers', () {
      final String text = errorText(
        failure('OVERLAPPING_LEAVE', <String, Object?>{'from': '2026-10-07', 'to': '2026-10-08'}),
      );
      expect(text, contains('7 ต.ค. 2569'));
      expect(text, contains('8 ต.ค. 2569'));
    });

    test('says what to do when the phone is offline', () {
      expect(errorText(ApiException.offline), contains('อินเทอร์เน็ต'));
    });

    test('falls back to the server’s message for a code it does not word', () {
      expect(
        errorText(const ApiException(statusCode: 500, code: 'SOMETHING_NEW', message: 'Boom')),
        'Boom',
      );
    });

    test('shows anything that is not an API failure without its type prefix', () {
      expect(errorText(Exception('Could not reach the server')), 'Could not reach the server');
    });
  });
}
