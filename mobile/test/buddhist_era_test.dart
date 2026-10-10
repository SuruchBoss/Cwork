// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'dart:io';

import 'package:cwork/core/i18n/buddhist_era_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

/// Thai screens show years in the Buddhist era (CW-058).
void main() {
  group('The date picker in Thai', () {
    Future<void> openPicker(WidgetTester tester, Locale locale) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: locale,
          supportedLocales: const <Locale>[Locale('th', 'TH'), Locale('en', 'US')],
          localizationsDelegates: const <LocalizationsDelegate<Object>>[
            ThaiBuddhistEraLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Builder(
            builder: (BuildContext context) => TextButton(
              onPressed: () => showDatePicker(
                context: context,
                initialDate: DateTime(2026, 10, 1),
                firstDate: DateTime(2025),
                lastDate: DateTime(2027, 12, 31),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      );
      // The localizations load asynchronously before the first frame shows.
      await tester.pumpAndSettle();
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
    }

    testWidgets('shows the month and the chosen day in the Buddhist era',
        (WidgetTester tester) async {
      await openPicker(tester, const Locale('th', 'TH'));

      expect(find.textContaining('2569'), findsWidgets);
      expect(find.textContaining('2026'), findsNothing);
    });

    testWidgets('stays Gregorian in English', (WidgetTester tester) async {
      await openPicker(tester, const Locale('en', 'US'));

      expect(find.textContaining('2026'), findsWidgets);
      expect(find.textContaining('2569'), findsNothing);
    });
  });

  group('A date typed into the picker', () {
    late ThaiBuddhistEraLocalizations thai;
    setUpAll(() async {
      await initializeDateFormatting('th');
      thai = ThaiBuddhistEraLocalizations();
    });

    test('is written and read day first in the Buddhist era', () {
      expect(thai.formatCompactDate(DateTime(2026, 10, 1)), '1/10/2569');
      expect(thai.parseCompactDate('1/10/2569'), DateTime(2026, 10, 1));
      expect(thai.dateHelpText, 'วว/ดด/ปปปป');
    });

    test('is refused when it is not a date', () {
      expect(thai.parseCompactDate('31/2/2569'), isNull);
      expect(thai.parseCompactDate('2026-10-01'), isNull);
    });
  });

  // The screens no test renders yet: refuse the ways a Gregorian year has
  // reached a Thai screen before.
  group('The app source', () {
    final List<File> sources = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((File file) => file.path.endsWith('.dart'))
        .toList();

    List<String> offending(RegExp pattern, {List<String> allowed = const <String>[]}) => <String>[
          for (final File file in sources)
            if (!allowed.any(file.path.endsWith))
              for (final (int i, String line) in file.readAsLinesSync().indexed)
                if (pattern.hasMatch(line)) '${file.path}:${i + 1}: ${line.trim()}',
        ];

    test('formats dates only through Fmt', () {
      expect(
        offending(
          RegExp(r'DateFormat[.(]'),
          allowed: <String>[
            'core/utils/formatters.dart',
            'core/i18n/buddhist_era_localizations.dart',
          ],
        ),
        isEmpty,
      );
    });

    test('shows a pay period as its month and a year through Fmt.year', () {
      expect(
        offending(RegExp(r'periodCode'))
            .where((String line) => !line.contains('payslip_models.dart'))
            .where(
              (String line) => !line.contains('Fmt.period('),
            ),
        isEmpty,
      );
      expect(
        offending(
          RegExp(r'\$\{?[\w.]*\.year\b'),
          allowed: <String>[
            'core/utils/formatters.dart',
            'core/i18n/buddhist_era_localizations.dart',
          ],
        ),
        isEmpty,
      );
    });
  });
}
