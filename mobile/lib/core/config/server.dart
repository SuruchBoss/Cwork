// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'app_config.dart';

/// Which company's server this install talks to (CW-060).
///
/// Kept in the platform keystore beside the tokens and the offline punch
/// queue, so an app update — which keeps all three — keeps the employee signed
/// in to the same company, with any punch still waiting to be sent.
class ServerStorage {
  ServerStorage([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  static const String _key = 'cwork.server';

  Future<String?> read() => _storage.read(key: _key);

  Future<void> write(String apiBaseUrl) => _storage.write(key: _key, value: apiBaseUrl);

  Future<void> clear() => _storage.delete(key: _key);
}

/// The API base URL this install is connected to, or null before the employee
/// has chosen one.
///
/// A build made with `--dart-define=API_BASE_URL=…` starts connected to that
/// server instead — a developer's emulator, or the web build the screenshots
/// and the film are recorded from. Nobody installing the app gets one.
class ServerController extends StateNotifier<String?> {
  ServerController(this._storage, [super.initial]);

  final ServerStorage _storage;

  /// Only a different server is news: reconnecting to the same one must not
  /// rebuild the API client and bounce a signed-in employee through the splash.
  @override
  bool updateShouldNotify(String? old, String? current) => old != current;

  Future<void> connect(String apiBaseUrl) async {
    await _storage.write(apiBaseUrl);
    state = apiBaseUrl;
  }

  Future<void> forget() async {
    await _storage.clear();
    state = null;
  }
}

/// Reads the saved server before the first frame, falling back to the
/// build-time one; null when there is neither.
Future<String?> loadSavedServer([ServerStorage? storage]) async {
  try {
    final String? saved = await (storage ?? ServerStorage()).read();
    if (saved != null && saved.isNotEmpty) return saved;
  } on Object {
    // No keystore (a test, an old device) is the same as nothing saved.
  }
  return AppConfig.apiBaseUrl.isEmpty ? null : AppConfig.apiBaseUrl;
}

final Provider<ServerStorage> serverStorageProvider =
    Provider<ServerStorage>((Ref ref) => ServerStorage());

final StateNotifierProvider<ServerController, String?> serverProvider =
    StateNotifierProvider<ServerController, String?>(
  (Ref ref) => ServerController(ref.watch(serverStorageProvider)),
);

/// A server address that arrived from outside — the install page's "open the
/// app" link — and is waiting for the employee to confirm it. The app never
/// switches servers on a link alone: a link can come from anybody.
final StateProvider<String?> pendingServerProvider = StateProvider<String?>((Ref ref) => null);

/// Why a server did not answer as a Cwork server.
enum ServerProbeProblem {
  /// No answer: no network, a wrong name, a server that is down.
  unreachable,

  /// An answer over a certificate the phone does not trust.
  untrustedCertificate,

  /// Something answered, but not Cwork.
  notCwork,
}

/// Asks [apiBaseUrl] for the public `/config` a Cwork server always answers,
/// before the address is saved. Null means it is a Cwork server.
Future<ServerProbeProblem?> probeServer(String apiBaseUrl, {Dio? dio}) async {
  final Dio client = dio ??
      Dio(
        BaseOptions(
          connectTimeout: AppConfig.connectTimeout,
          receiveTimeout: AppConfig.connectTimeout,
          validateStatus: (_) => true,
        ),
      );
  try {
    final Response<dynamic> response = await client.get<dynamic>('$apiBaseUrl/config');
    final Object? body = response.data;
    if (response.statusCode == 200 && body is Map && body['assistantEnabled'] is bool) {
      return null;
    }
    return ServerProbeProblem.notCwork;
  } on DioException catch (error) {
    // By name rather than by type: `HandshakeException` lives in dart:io, which
    // the web build the screenshots are taken from cannot import.
    final String cause = '${error.error}';
    if (error.type == DioExceptionType.badCertificate ||
        cause.contains('HandshakeException') ||
        cause.contains('CERTIFICATE_VERIFY_FAILED')) {
      return ServerProbeProblem.untrustedCertificate;
    }
    return ServerProbeProblem.unreachable;
  } finally {
    if (dio == null) client.close();
  }
}
