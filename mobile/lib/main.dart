import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Thai month names and number formats come from here; without it every date
  // in the app renders in English.
  await initializeDateFormatting('th');

  runApp(const ProviderScope(child: CworkApp()));
}
