import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/config/app_config.dart';
import '../domain/attendance_models.dart';

/// Durable queue of punches captured while offline.
///
/// This is the difference between "the app didn't work at the warehouse" and
/// "it synced when I got signal". Punches are stored with the instant they were
/// captured and a client id, so the server can dedupe replays and the employee
/// is credited with the time they actually arrived — not the time the phone
/// found a network.
///
/// The queue lives in `flutter_secure_storage` (the platform keystore), the same
/// place tokens do — not `SharedPreferences`, which the owner of a rooted device
/// can read and edit, making a queued arrival time forgeable (CW-025). Secure
/// storage has no list type, so the queue is one JSON array under a single key.
class PunchQueue {
  PunchQueue([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  static const String _key = 'cwork.punchQueue';
  final FlutterSecureStorage _storage;

  Future<List<QueuedPunch>> all() async {
    final String? raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return <QueuedPunch>[];
    final List<dynamic> decoded = jsonDecode(raw) as List<dynamic>;
    return decoded
        .map((dynamic entry) => QueuedPunch.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<void> add(QueuedPunch punch) async {
    final List<QueuedPunch> punches = await all();

    // Bound the queue: a phone that has been offline for weeks should not grow
    // an unbounded backlog. Oldest entries are dropped first.
    if (punches.length >= AppConfig.offlineQueueLimit) {
      punches.removeAt(0);
    }

    punches.add(punch);
    await _save(punches);
  }

  Future<void> remove(String clientPunchId) async {
    final List<QueuedPunch> punches = await all();
    punches.removeWhere((QueuedPunch punch) => punch.clientPunchId == clientPunchId);
    await _save(punches);
  }

  Future<void> clear() async {
    await _storage.delete(key: _key);
  }

  Future<int> count() async => (await all()).length;

  Future<void> _save(List<QueuedPunch> punches) async {
    await _storage.write(
      key: _key,
      value: jsonEncode(punches.map((QueuedPunch punch) => punch.toJson()).toList()),
    );
  }
}
