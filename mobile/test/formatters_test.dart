// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:cwork/core/utils/formatters.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('th');
  });

  group('Fmt.minutes', () {
    test('renders hours and minutes', () {
      expect(Fmt.minutes(485), '8 ชม. 5 นาที');
    });

    test('drops minutes when they are zero', () {
      expect(Fmt.minutes(480), '8 ชม.');
    });

    test('renders minutes only under an hour', () {
      expect(Fmt.minutes(45), '45 นาที');
    });

    test('renders an explicit zero rather than an em dash', () {
      expect(Fmt.minutes(0), '0 ชม.');
    });

    test('renders an em dash when the value is missing', () {
      expect(Fmt.minutes(null), '—');
    });
  });

  group('Fmt.money', () {
    test('accepts the string decimals the API returns', () {
      expect(Fmt.money('42900.00'), contains('42,900.00'));
    });

    test('renders an em dash for a missing amount, never ฿0.00', () {
      expect(Fmt.money(null), '—');
    });

    test('renders an em dash for an unparseable value', () {
      expect(Fmt.money('not-a-number'), '—');
    });
  });

  group('Fmt.number', () {
    test('honours the requested precision', () {
      expect(Fmt.number('6.5'), '6.5');
      expect(Fmt.number(6.5, digits: 0), '7');
    });
  });

  group('Fmt.initials', () {
    test('takes the first letter of each of the first two words', () {
      expect(Fmt.initials('สมชาย ใจดี'), 'สใ');
    });

    test('falls back to the first two characters of a single word', () {
      expect(Fmt.initials('Somchai'), 'So');
    });

    test('handles a missing name', () {
      expect(Fmt.initials(null), '?');
    });
  });

  group('Fmt.time', () {
    test('formats an ISO instant as local wall-clock time', () {
      expect(Fmt.time('2026-09-15T02:00:00.000Z'), matches(RegExp(r'^\d{2}:\d{2}$')));
    });

    test('renders an em dash when there is no timestamp', () {
      expect(Fmt.time(null), '—');
    });
  });
}
