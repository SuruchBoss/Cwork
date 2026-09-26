// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../utils/formatters.dart';
import 'messages_th.dart';

/// Lightweight, dependency-free localisation for the mobile app (CW-016).
///
/// The message key *is* the English source string: English needs no catalogue,
/// and a missing Thai entry falls back to the readable key rather than a blank.
/// Thai is the default, so the app renders exactly as before until the user
/// switches. Widgets translate with `ref.tr('English key')` so they rebuild on a
/// switch; non-widget code (formatters, controllers, error mapping) uses the
/// non-reactive `tr0`.

enum AppLanguage { th, en }

/// The languages offered in the switcher, each written in its own script.
const List<({AppLanguage value, String label})> kLanguages = <({AppLanguage value, String label})>[
  (value: AppLanguage.th, label: 'ไทย'),
  (value: AppLanguage.en, label: 'English'),
];

const String _prefsKey = 'cwork.language';

/// The current language for non-reactive callers. Kept in sync by
/// [LanguageController]; defaults to Thai, so tests and any code that runs
/// before the controller is built see Thai.
AppLanguage currentLanguage = AppLanguage.th;

String _localeCode(AppLanguage lang) => lang == AppLanguage.en ? 'en' : 'th';

/// Translate [key] into [language], filling `{name}` placeholders from [params].
String translate(String key, AppLanguage language, [Map<String, Object>? params]) {
  String base = language == AppLanguage.th ? (thMessages[key] ?? key) : key;
  if (params == null) return base;
  params.forEach((String name, Object value) {
    base = base.replaceAll('{$name}', '$value');
  });
  return base;
}

/// Translate against the current language, outside the widget tree.
String tr0(String key, [Map<String, Object>? params]) => translate(key, currentLanguage, params);

/// Reads the saved language before the first frame; defaults to Thai when
/// nothing is stored or the platform has no preferences plugin (e.g. tests).
Future<AppLanguage> loadSavedLanguage() async {
  try {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return prefs.getString(_prefsKey) == 'en' ? AppLanguage.en : AppLanguage.th;
  } on Object {
    return AppLanguage.th;
  }
}

class LanguageController extends StateNotifier<AppLanguage> {
  LanguageController([AppLanguage initial = AppLanguage.th]) : super(initial) {
    _apply(initial);
  }

  Future<void> set(AppLanguage language) async {
    state = language;
    _apply(language);
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, language.name);
    } on Object {
      // A failed write is not worth interrupting the switch — the language
      // still applies for this session.
    }
  }

  /// Keeps the non-reactive globals in step with the reactive state, so
  /// formatters and controllers speak the same language as the widgets.
  void _apply(AppLanguage language) {
    currentLanguage = language;
    Fmt.locale = _localeCode(language);
  }
}

final StateNotifierProvider<LanguageController, AppLanguage> languageProvider =
    StateNotifierProvider<LanguageController, AppLanguage>(
  (Ref ref) => LanguageController(),
);

/// `ref.tr('key')` — translates against the current language and rebuilds the
/// caller when the language changes.
extension Tr on WidgetRef {
  String tr(String key, [Map<String, Object>? params]) =>
      translate(key, watch(languageProvider), params);
}

/// The `Locale` for `MaterialApp`, derived from the current language.
Locale localeFor(AppLanguage language) =>
    language == AppLanguage.en ? const Locale('en', 'US') : const Locale('th', 'TH');
