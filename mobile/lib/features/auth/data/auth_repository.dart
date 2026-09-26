// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

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

  /// Signs in, which may stop half way when the account owes a second factor.
  ///
  /// Returns either a session or a challenge; the caller decides which screen
  /// to show. Nothing is stored for a challenge — it is not a session.
  Future<LoginOutcome> login({
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

    if (result['mfaRequired'] == true) {
      return MfaRequired(
        challengeToken: result['challengeToken'] as String,
        enrolled: result['mfaEnrolled'] as bool? ?? false,
      );
    }

    return LoggedIn(await _adoptSession(result));
  }

  /// Exchanges a challenge token and a code — generated or recovery — for a
  /// session.
  Future<SessionUser> verifyMfa({
    required String challengeToken,
    required String code,
  }) async {
    final Map<String, dynamic> result = await _api.post<Map<String, dynamic>>(
      '/auth/mfa/verify',
      anonymous: true,
      body: <String, dynamic>{
        'challengeToken': challengeToken,
        'code': code.trim(),
        'deviceId': await _tokenStorage.deviceId(),
        'deviceName': await _deviceName(),
        'platform': defaultTargetPlatform.name,
      },
    );

    return _adoptSession(result);
  }

  Future<SessionUser> _adoptSession(Map<String, dynamic> result) async {
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
