import 'package:flutter_test/flutter_test.dart';
import 'package:marma_hris/features/attendance/data/punch_queue.dart';
import 'package:marma_hris/features/attendance/domain/attendance_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

QueuedPunch buildPunch(String id, {String type = 'CLOCK_IN'}) => QueuedPunch(
      clientPunchId: id,
      type: type,
      capturedAt: DateTime.utc(2026, 9, 15, 2, 0),
      latitude: 13.7212,
      longitude: 100.5286,
      accuracyM: 12,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late PunchQueue queue;

  setUp(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    queue = PunchQueue(await SharedPreferences.getInstance());
  });

  test('starts empty', () async {
    expect(await queue.count(), 0);
  });

  test('stores a punch and reads it back intact', () async {
    await queue.add(buildPunch('p-1'));

    final List<QueuedPunch> all = await queue.all();
    expect(all, hasLength(1));
    expect(all.first.clientPunchId, 'p-1');
    expect(all.first.latitude, 13.7212);
    expect(all.first.accuracyM, 12);
    expect(all.first.capturedAt, DateTime.utc(2026, 9, 15, 2, 0));
  });

  test('keeps queue order so punches replay chronologically', () async {
    await queue.add(buildPunch('p-1'));
    await queue.add(buildPunch('p-2', type: 'CLOCK_OUT'));

    final List<QueuedPunch> all = await queue.all();
    expect(all.map((QueuedPunch p) => p.clientPunchId), <String>['p-1', 'p-2']);
  });

  test('removes only the acknowledged punch', () async {
    await queue.add(buildPunch('p-1'));
    await queue.add(buildPunch('p-2'));

    await queue.remove('p-1');

    final List<QueuedPunch> all = await queue.all();
    expect(all, hasLength(1));
    expect(all.first.clientPunchId, 'p-2');
  });

  test('drops the oldest entry once the queue is full', () async {
    for (int i = 0; i < 55; i++) {
      await queue.add(buildPunch('p-$i'));
    }

    final List<QueuedPunch> all = await queue.all();
    expect(all.length, lessThanOrEqualTo(50));
    // The newest punch must survive; the oldest is the one sacrificed.
    expect(all.last.clientPunchId, 'p-54');
    expect(all.any((QueuedPunch p) => p.clientPunchId == 'p-0'), isFalse);
  });

  test('request body carries the client id so a replay is idempotent', () {
    final Map<String, dynamic> body = buildPunch('p-9').toRequestBody();

    expect(body['clientPunchId'], 'p-9');
    expect(body['type'], 'CLOCK_IN');
    expect(body['method'], 'MOBILE_GPS');
    expect(body['clientTime'], isNotNull);
  });

  test('falls back to a non-GPS method when there is no location fix', () {
    final QueuedPunch noGps = QueuedPunch(
      clientPunchId: 'p-x',
      type: 'CLOCK_IN',
      capturedAt: DateTime.utc(2026, 9, 15, 2, 0),
    );

    final Map<String, dynamic> body = noGps.toRequestBody();
    expect(body['method'], 'WEB');
    expect(body.containsKey('latitude'), isFalse);
    // The punch is still sent: no GPS must never mean no attendance record.
    expect(body['clientPunchId'], 'p-x');
  });
}
