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

  static DateFormat get _date => DateFormat('d MMM yyyy', _intlLocale);
  static DateFormat get _dateShort => DateFormat('d MMM', _intlLocale);
  static DateFormat get _dateTime => DateFormat('d MMM yyyy HH:mm', _intlLocale);
  static NumberFormat get _money => NumberFormat.currency(
        locale: _en ? 'en_US' : 'th_TH',
        symbol: '฿',
        decimalDigits: 2,
      );

  static String date(Object? value) {
    final DateTime? parsed = _parse(value);
    return parsed == null ? '—' : _date.format(parsed);
  }

  static String dateShort(Object? value) {
    final DateTime? parsed = _parse(value);
    return parsed == null ? '—' : _dateShort.format(parsed);
  }

  static String dateTime(Object? value) {
    final DateTime? parsed = _parse(value);
    return parsed == null ? '—' : _dateTime.format(parsed.toLocal());
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
      return _date.format(parsed);
    }
    if (diff.inMinutes < 1) return 'เมื่อสักครู่';
    if (diff.inMinutes < 60) return '${diff.inMinutes} นาทีที่แล้ว';
    if (diff.inHours < 24) return '${diff.inHours} ชั่วโมงที่แล้ว';
    if (diff.inDays < 7) return '${diff.inDays} วันที่แล้ว';
    return _date.format(parsed);
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
