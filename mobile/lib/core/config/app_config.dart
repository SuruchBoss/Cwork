// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/// Build-time configuration.
///
/// The company's server is **not** here: one build serves every company, and
/// the employee chooses the server at first launch (CW-060, `server.dart`).
/// A developer can still preset one, which skips that screen:
///
/// ```
/// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
/// ```
class AppConfig {
  const AppConfig._();

  /// A preset server for development builds; empty in every build handed out.
  /// 10.0.2.2 is how the Android emulator reaches the host machine.
  static const String apiBaseUrl = String.fromEnvironment('API_BASE_URL');

  static const String appName = String.fromEnvironment(
    'APP_NAME',
    defaultValue: 'Cwork',
  );

  /// Punches are queued locally when offline and flushed on reconnect.
  static const int offlineQueueLimit = 50;

  /// Clock-in requires a GPS fix at least this accurate before it will warn.
  static const double poorAccuracyMeters = 500;

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);
}
