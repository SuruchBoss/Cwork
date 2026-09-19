import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'core/i18n/i18n.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Month names and number formats for both languages (CW-016); without this a
  // date renders in the wrong script after a language switch.
  await initializeDateFormatting('th');
  await initializeDateFormatting('en');

  // Open in the saved language so the first frame is already correct.
  final AppLanguage language = await loadSavedLanguage();

  runApp(
    ProviderScope(
      overrides: <Override>[
        languageProvider.overrideWith((Ref ref) => LanguageController(language)),
      ],
      child: const CworkApp(),
    ),
  );
}
