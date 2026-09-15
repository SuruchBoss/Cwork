import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Tokens live in the platform keystore (Android EncryptedSharedPreferences /
/// iOS Keychain), never in SharedPreferences — a refresh token is a credential
/// with a 30-day life and must survive neither a backup nor a rooted-device dump
/// in plaintext.
class TokenStorage {
  TokenStorage([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  static const String _accessKey = 'marma.accessToken';
  static const String _refreshKey = 'marma.refreshToken';
  static const String _deviceKey = 'marma.deviceId';

  Future<String?> readAccessToken() => _storage.read(key: _accessKey);

  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
  }

  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }

  /// Stable per-install id, so the server can list and revoke this device.
  Future<String> deviceId() async {
    final String? existing = await _storage.read(key: _deviceKey);
    if (existing != null) return existing;

    final String generated = 'dev-${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';
    await _storage.write(key: _deviceKey, value: generated);
    return generated;
  }
}
