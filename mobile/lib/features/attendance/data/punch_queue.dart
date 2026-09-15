import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/config/app_config.dart';
import '../domain/attendance_models.dart';

/// Durable queue of punches captured while offline.
///
/// This is the difference between "the app didn't work at the warehouse" and
/// "it synced when I got signal". Punches are stored with the instant they were
/// captured and a client id, so the server can dedupe replays and the employee
/// is credited with the time they actually arrived — not the time the phone
/// found a network.
class PunchQueue {
  PunchQueue([SharedPreferences? prefs]) : _injected = prefs;

  static const String _key = 'marma.punchQueue';
  final SharedPreferences? _injected;

  Future<SharedPreferences> get _prefs async => _injected ?? await SharedPreferences.getInstance();

  Future<List<QueuedPunch>> all() async {
    final SharedPreferences prefs = await _prefs;
    final List<String> raw = prefs.getStringList(_key) ?? <String>[];
    return raw
        .map((String entry) => QueuedPunch.fromJson(jsonDecode(entry) as Map<String, dynamic>))
        .toList();
  }

  Future<void> add(QueuedPunch punch) async {
    final SharedPreferences prefs = await _prefs;
    final List<String> raw = prefs.getStringList(_key) ?? <String>[];

    // Bound the queue: a phone that has been offline for weeks should not grow
    // an unbounded backlog. Oldest entries are dropped first.
    if (raw.length >= AppConfig.offlineQueueLimit) {
      raw.removeAt(0);
    }

    raw.add(jsonEncode(punch.toJson()));
    await prefs.setStringList(_key, raw);
  }

  Future<void> remove(String clientPunchId) async {
    final SharedPreferences prefs = await _prefs;
    final List<String> raw = prefs.getStringList(_key) ?? <String>[];
    raw.removeWhere((String entry) {
      final Map<String, dynamic> decoded = jsonDecode(entry) as Map<String, dynamic>;
      return decoded['clientPunchId'] == clientPunchId;
    });
    await prefs.setStringList(_key, raw);
  }

  Future<void> clear() async {
    final SharedPreferences prefs = await _prefs;
    await prefs.remove(_key);
  }

  Future<int> count() async => (await all()).length;
}
