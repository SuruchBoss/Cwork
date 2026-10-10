// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:intl/intl.dart';

/// Formatting helpers shared across screens.
///
/// The API returns decimals as strings to avoid float drift, so these parse
/// rather than assume a numeric type — and never compute, only display.
///
/// [locale] is set by the language controller (CW-016) and defaults to Thai, so
/// dates, currency and the relative/duration words follow the chosen language.
class Fmt {
  const Fmt._();

  /// `'th'` or `'en'`. Set by `LanguageController`; defaults to Thai.
  static String locale = 'th';

  static bool get _en => locale == 'en';
  static String get _intlLocale => _en ? 'en' : 'th';

  static final DateFormat _time = DateFormat('HH:mm');
  static final DateFormat _iso = DateFormat('yyyy-MM-dd');

  /// Thai years are counted in the Buddhist era (CW-058): 2569 is 2026. Only
  /// what is displayed changes; the API's dates stay Gregorian ISO.
  static const int buddhistEraOffset = 543;

  /// Formats [date] with [pattern] in the current language. intl has no
  /// Buddhist calendar, so in Thai every `y` run outside quotes becomes the
  /// Buddhist-era year as a quoted literal first; `yy` keeps its meaning of
  /// the last two digits.
  static String _format(String pattern, DateTime date) {
    if (_en) return DateFormat(pattern, _intlLocale).format(date);
    final String year = '${date.year + buddhistEraOffset}';
    final StringBuffer out = StringBuffer();
    bool quoted = false;
    for (int i = 0; i < pattern.length; i++) {
      final String char = pattern[i];
      if (char == "'") {
        quoted = !quoted;
        out.write(char);
      } else if (char == 'y' && !quoted) {
        int run = 1;
        while (i + run < pattern.length && pattern[i + run] == 'y') {
          run++;
        }
        out.write("'${run == 2 ? year.substring(year.length - 2) : year}'");
        i += run - 1;
      } else {
        out.write(char);
      }
    }
    return DateFormat(out.toString(), _intlLocale).format(date);
  }

  /// A Gregorian year as the reader counts it: Buddhist era in Thai.
  static String year(int value) => '${_en ? value : value + buddhistEraOffset}';
  static NumberFormat get _money => NumberFormat.currency(
        locale: _en ? 'en_US' : 'th_TH',
        symbol: '฿',
        decimalDigits: 2,
      );

  static String date(Object? value) {
    final DateTime? parsed = _parse(value);
    return parsed == null ? '—' : _format('d MMM yyyy', parsed);
  }

  /// A date with the month in words, the way a document writes it:
  /// "15 มกราคม 2567" / "15 January 2024". For the payslip's pay date.
  static String dateLong(Object? value) {
    final DateTime? parsed = _parse(value);
    return parsed == null ? '—' : _format('d MMMM yyyy', parsed);
  }

  static String dateShort(Object? value) {
    final DateTime? parsed = _parse(value);
    return parsed == null ? '—' : _format('d MMM', parsed);
  }

  static String dateTime(Object? value) {
    final DateTime? parsed = _parse(value);
    return parsed == null ? '—' : _format('d MMM yyyy HH:mm', parsed.toLocal());
  }

  static String time(Object? value) {
    final DateTime? parsed = _parse(value);
    return parsed == null ? '—' : _time.format(parsed.toLocal());
  }

  static String isoDate(DateTime value) => _iso.format(value);

  static String money(Object? value) {
    final double? amount = _toDouble(value);
    return amount == null ? '—' : _money.format(amount);
  }

  static String number(Object? value, {int digits = 1}) {
    final double? amount = _toDouble(value);
    if (amount == null) return '—';
    return amount.toStringAsFixed(digits);
  }

  /// A count of days: "6", "0.5", "1.5" — never "6.0", which reads as a
  /// measurement rather than a number of days off.
  static String days(Object? value) {
    final String fixed = number(value);
    return fixed.endsWith('.0') ? fixed.substring(0, fixed.length - 2) : fixed;
  }

  /// A pay period's code as the dates it covers: "2026-08" reads
  /// "สิงหาคม 2569" / "August 2026", and a half of a semi-monthly month
  /// (CW-069) "2026-11-H1" reads "1–15 พฤศจิกายน 2569", "2026-11-H2"
  /// "16–30 พฤศจิกายน 2569". Any other code is shown as HR wrote it.
  static String period(String code) {
    final RegExpMatch? match = RegExp(r'^(\d{4})-(\d{2})(?:-H([12]))?$').firstMatch(code);
    if (match == null) return code;
    final int year = int.parse(match.group(1)!);
    final int month = int.parse(match.group(2)!);
    if (month < 1 || month > 12) return code;
    final String monthYear = _format('MMMM yyyy', DateTime(year, month));
    final String? half = match.group(3);
    if (half == null) return monthYear;
    final int lastDay = DateTime(year, month + 1, 0).day;
    return half == '1' ? '1–15 $monthYear' : '16–$lastDay $monthYear';
  }

  /// Minutes as "8 ชม. 5 นาที" (Thai) or "8 hr 5 min" (English). Zero renders
  /// explicitly, not as an em dash.
  static String minutes(int? value) {
    if (value == null) return '—';
    final String hourUnit = _en ? 'hr' : 'ชม.';
    final String minUnit = _en ? 'min' : 'นาที';
    if (value == 0) return '0 $hourUnit';
    final int hours = value.abs() ~/ 60;
    final int mins = value.abs() % 60;
    final String sign = value < 0 ? '-' : '';
    if (hours == 0) return '$sign$mins $minUnit';
    if (mins == 0) return '$sign$hours $hourUnit';
    return '$sign$hours $hourUnit $mins $minUnit';
  }

  static String relative(Object? value) {
    final DateTime? parsed = _parse(value);
    if (parsed == null) return '—';

    final Duration diff = DateTime.now().difference(parsed.toLocal());
    if (_en) {
      if (diff.inMinutes < 1) return 'just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return _format('d MMM yyyy', parsed);
    }
    if (diff.inMinutes < 1) return 'เมื่อสักครู่';
    if (diff.inMinutes < 60) return '${diff.inMinutes} นาทีที่แล้ว';
    if (diff.inHours < 24) return '${diff.inHours} ชั่วโมงที่แล้ว';
    if (diff.inDays < 7) return '${diff.inDays} วันที่แล้ว';
    return _format('d MMM yyyy', parsed);
  }

  static String initials(String? name) {
    final String trimmed = (name ?? '').trim();
    if (trimmed.isEmpty) return '?';
    final List<String> parts = trimmed.split(RegExp(r'\s+'));
    if (parts.length == 1) {
      return parts.first.characters(2);
    }
    return '${parts[0].characters(1)}${parts[1].characters(1)}';
  }

  static DateTime? _parse(Object? value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    return DateTime.tryParse(value.toString());
  }

  static double? _toDouble(Object? value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }
}

extension on String {
  String characters(int count) => length <= count ? this : substring(0, count);
}
