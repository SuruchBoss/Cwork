/// Build-time configuration.
///
/// Values come from `--dart-define`, so a release build is pinned to the API it
/// was built against and nothing sensitive is bundled in the source tree:
///
/// ```
/// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
/// ```
class AppConfig {
  const AppConfig._();

  /// 10.0.2.2 is how the Android emulator reaches the host machine.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api/v1',
  );

  static const String appName = String.fromEnvironment(
    'APP_NAME',
    defaultValue: 'MarMa HRIS',
  );

  /// Punches are queued locally when offline and flushed on reconnect.
  static const int offlineQueueLimit = 50;

  /// Clock-in requires a GPS fix at least this accurate before it will warn.
  static const double poorAccuracyMeters = 500;

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 30);
}
