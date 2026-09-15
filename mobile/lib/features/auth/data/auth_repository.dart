import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';

import '../../../core/network/api_client.dart';
import '../../../core/storage/token_storage.dart';
import '../domain/session.dart';

class AuthRepository {
  AuthRepository({required ApiClient api, required TokenStorage tokenStorage})
      : _api = api,
        _tokenStorage = tokenStorage;

  final ApiClient _api;
  final TokenStorage _tokenStorage;

  Future<SessionUser> login({
    required String email,
    required String password,
  }) async {
    final Map<String, dynamic> result = await _api.post<Map<String, dynamic>>(
      '/auth/login',
      anonymous: true,
      body: <String, dynamic>{
        'email': email.trim().toLowerCase(),
        'password': password,
        'deviceId': await _tokenStorage.deviceId(),
        'deviceName': await _deviceName(),
        'platform': defaultTargetPlatform.name,
      },
    );

    await _tokenStorage.saveTokens(
      accessToken: result['accessToken'] as String,
      refreshToken: result['refreshToken'] as String,
    );

    return SessionUser.fromJson(result['user'] as Map<String, dynamic>);
  }

  Future<SessionUser> me() async {
    final Map<String, dynamic> result = await _api.get<Map<String, dynamic>>('/auth/me');
    return SessionUser.fromJson(result);
  }

  Future<void> logout() async {
    try {
      await _api.post<dynamic>('/auth/logout', body: <String, dynamic>{});
    } on Object {
      // Signing out locally must succeed even if the server is unreachable.
    } finally {
      await _tokenStorage.clear();
    }
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) =>
      _api.post<dynamic>(
        '/auth/change-password',
        body: <String, dynamic>{
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        },
      );

  Future<bool> hasStoredSession() async => await _tokenStorage.readAccessToken() != null;

  Future<String> _deviceName() async {
    final DeviceInfoPlugin info = DeviceInfoPlugin();
    try {
      if (defaultTargetPlatform == TargetPlatform.android) {
        final AndroidDeviceInfo android = await info.androidInfo;
        return '${android.manufacturer} ${android.model}';
      }
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        final IosDeviceInfo ios = await info.iosInfo;
        return '${ios.name} (${ios.model})';
      }
    } on Object {
      // Device name is cosmetic; never block sign-in on it.
    }
    return 'Cwork Mobile';
  }
}
