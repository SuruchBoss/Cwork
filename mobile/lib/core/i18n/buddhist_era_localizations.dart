// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart';

import '../utils/formatters.dart';

/// Material's Thai strings with years in the Buddhist era (CW-058).
///
/// The date picker writes its header, its year list and its typed date
/// through [MaterialLocalizations], and intl has no Buddhist calendar, so in
/// Thai it showed 2026. This writes 2569 everywhere the picker shows a year,
/// and reads a typed date day first with a Buddhist-era year, the way Thai is
/// written: 1/10/2569 is 1 October 2026. The picked value is still a plain
/// DateTime.
class ThaiBuddhistEraLocalizations extends MaterialLocalizationTh {
  ThaiBuddhistEraLocalizations()
      : super(
          fullYearFormat: DateFormat.y('th'),
          compactDateFormat: DateFormat('d/M/y', 'th'),
          shortDateFormat: DateFormat.yMMMd('th'),
          mediumDateFormat: DateFormat.MMMEd('th'),
          longDateFormat: DateFormat.yMMMMEEEEd('th'),
          yearMonthFormat: DateFormat.yMMMM('th'),
          shortMonthDayFormat: DateFormat.MMMd('th'),
          decimalFormat: NumberFormat.decimalPattern('th'),
          twoDigitZeroPaddedFormat: NumberFormat('00', 'th'),
        );

  static const LocalizationsDelegate<MaterialLocalizations> delegate = _Delegate();

  /// The Gregorian year in [text], which [date] was formatted into, swapped
  /// for the Buddhist-era one. Each of these formats writes the year once.
  static String _era(String text, DateTime date) =>
      text.replaceFirst('${date.year}', Fmt.year(date.year));

  @override
  String formatYear(DateTime date) => Fmt.year(date.year);

  @override
  String formatCompactDate(DateTime date) => _era(super.formatCompactDate(date), date);

  @override
  String formatShortDate(DateTime date) => _era(super.formatShortDate(date), date);

  @override
  String formatFullDate(DateTime date) => _era(super.formatFullDate(date), date);

  @override
  String formatMonthYear(DateTime date) => _era(super.formatMonthYear(date), date);

  @override
  String get dateHelpText => 'วว/ดด/ปปปป';

  @override
  DateTime? parseCompactDate(String? inputString) {
    final RegExpMatch? match =
        RegExp(r'^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$').firstMatch(inputString ?? '');
    if (match == null) return null;
    final int day = int.parse(match.group(1)!);
    final int month = int.parse(match.group(2)!);
    int year = int.parse(match.group(3)!);
    // A year of 2400 or more is Buddhist era; nobody types a date from 1857.
    if (year >= 2400) year -= Fmt.buddhistEraOffset;
    final DateTime date = DateTime(year, month, day);
    // Refuses 31/2 and 13/1, which DateTime would roll into the next month.
    if (date.year != year || date.month != month || date.day != day) return null;
    return date;
  }
}

/// Loads Material's strings as usual, then swaps in the Buddhist-era Thai ones.
class _Delegate extends LocalizationsDelegate<MaterialLocalizations> {
  const _Delegate();

  @override
  bool isSupported(Locale locale) => GlobalMaterialLocalizations.delegate.isSupported(locale);

  @override
  Future<MaterialLocalizations> load(Locale locale) async {
    // Loading the stock strings first also loads intl's Thai date symbols.
    final MaterialLocalizations stock = await GlobalMaterialLocalizations.delegate.load(locale);
    return locale.languageCode == 'th' ? ThaiBuddhistEraLocalizations() : stock;
  }

  @override
  bool shouldReload(_Delegate old) => false;
}
