import 'package:intl/intl.dart';

/// Formatting helpers shared across screens.
///
/// The API returns decimals as strings to avoid float drift, so these parse
/// rather than assume a numeric type — and never compute, only display.
class Fmt {
  const Fmt._();

  static final DateFormat _date = DateFormat('d MMM yyyy', 'th');
  static final DateFormat _dateShort = DateFormat('d MMM', 'th');
  static final DateFormat _dateTime = DateFormat('d MMM yyyy HH:mm', 'th');
  static final DateFormat _time = DateFormat('HH:mm');
  static final DateFormat _iso = DateFormat('yyyy-MM-dd');
  static final NumberFormat _money = NumberFormat.currency(
    locale: 'th_TH',
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

  /// Minutes as "8 ชม. 5 นาที". Zero renders explicitly, not as an em dash.
  static String minutes(int? value) {
    if (value == null) return '—';
    if (value == 0) return '0 ชม.';
    final int hours = value.abs() ~/ 60;
    final int mins = value.abs() % 60;
    final String sign = value < 0 ? '-' : '';
    if (hours == 0) return '$sign$mins นาที';
    if (mins == 0) return '$sign$hours ชม.';
    return '$sign$hours ชม. $mins นาที';
  }

  static String relative(Object? value) {
    final DateTime? parsed = _parse(value);
    if (parsed == null) return '—';

    final Duration diff = DateTime.now().difference(parsed.toLocal());
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
