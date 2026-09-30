// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import '../i18n/i18n.dart';
import '../utils/formatters.dart';
import 'api_exception.dart';

/// What to tell a person when a request fails, in their language.
///
/// The server's `message` is English prose written for developers ("ลาพักร้อน
/// requires 3 days of notice"), and showing it put the only English on a Thai
/// screen at exactly the moment the person was stuck. The `code` is the stable
/// contract, so the rules an employee or manager can meet in the leave and
/// approval flows are worded here, each saying what happened and what to do.
/// Any other failure falls back to the server's message, as before.
String errorText(Object error) {
  if (error is! ApiException) return _stripPrefix(error.toString());

  final Map<String, Object?> details = error.details is Map
      ? Map<String, Object?>.from(error.details! as Map<Object?, Object?>)
      : const <String, Object?>{};
  String n(String key) => Fmt.days(details[key]);

  final String? text = switch (error.code) {
    'OFFLINE' => tr0('No internet connection. Check your signal and try again'),
    'INSUFFICIENT_LEAVE_BALANCE' => tr0(
        'Not enough leave left: you have {available} days, and this request needs {requested}',
        <String, Object>{'available': n('available'), 'requested': n('requested')},
      ),
    'OVERLAPPING_LEAVE' => tr0(
        'You already have leave on some of these days ({from} – {to}). Pick other dates, or cancel that request first',
        <String, Object>{
          'from': Fmt.date(details['from']),
          'to': Fmt.date(details['to']),
        },
      ),
    'LEAVE_NOTICE_TOO_SHORT' => tr0(
        'This leave type must be requested at least {days} days ahead. Pick a later date, or ask your manager',
        <String, Object>{'days': n('requiredDays')},
      ),
    'LEAVE_ATTACHMENT_REQUIRED' => tr0(
        'This leave type needs a supporting document, such as a medical certificate. Send it to HR, who will file the request for you',
      ),
    'NO_WORKING_DAYS_SELECTED' =>
      tr0('The days you picked are all days off. Pick at least one working day'),
    'HALF_DAY_NOT_ALLOWED' => tr0('This leave type is taken in full days only. Choose "Full day"'),
    'EXCEEDS_MAX_CONSECUTIVE' =>
      tr0('That is more days in a row than this leave type allows. Split it into shorter requests'),
    'INSUFFICIENT_SERVICE' => tr0(
        'You have not worked here long enough for this leave type yet. Ask HR if you are unsure',
      ),
    'LEAVE_TYPE_NOT_ELIGIBLE' => tr0('This leave type is not available to you. Ask HR'),
    'LEAVE_ALREADY_STARTED' =>
      tr0('This leave has already started, so it cannot be cancelled here. Ask your manager'),
    'NOT_CANCELLABLE' => tr0('This request can no longer be cancelled'),
    'APPROVAL_NOT_PENDING' =>
      tr0('Someone has already decided this request. Pull down to refresh the list'),
    _ => null,
  };
  return text ?? error.message;
}

String _stripPrefix(String raw) {
  final int separator = raw.indexOf(': ');
  return separator >= 0 ? raw.substring(separator + 2) : raw;
}
