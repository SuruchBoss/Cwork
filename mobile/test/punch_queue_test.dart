import 'package:cwork/features/attendance/data/punch_queue.dart';
import 'package:cwork/features/attendance/domain/attendance_models.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

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

  // The queue now lives in flutter_secure_storage (CW-025), which has no
  // in-memory test double, so we stand its platform channel up on a plain Map.
  const MethodChannel channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  late Map<String, String> store;
  late PunchQueue queue;

  setUp(() {
    store = <String, String>{};
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (MethodCall call) async {
      final Map<String, dynamic> args =
          (call.arguments as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
      switch (call.method) {
        case 'write':
          store[args['key'] as String] = args['value'] as String;
          return null;
        case 'read':
          return store[args['key'] as String];
        case 'containsKey':
          return store.containsKey(args['key'] as String);
        case 'delete':
          store.remove(args['key'] as String);
          return null;
        case 'readAll':
          return Map<String, String>.from(store);
        case 'deleteAll':
          store.clear();
          return null;
        default:
          return null;
      }
    });
    queue = PunchQueue();
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('starts empty', () async {
    expect(await queue.count(), 0);
  });

  test('stores a punch in secure storage and reads it back intact', () async {
    await queue.add(buildPunch('p-1'));

    // The queue must not touch SharedPreferences: a rooted device can edit that,
    // and forging an arrival time is exactly what CW-025 closes off.
    expect(store.containsKey('cwork.punchQueue'), isTrue);

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

  test('carries a rooted-device flag through storage and into the request body', () async {
    final QueuedPunch rooted = QueuedPunch(
      clientPunchId: 'p-root',
      type: 'CLOCK_IN',
      capturedAt: DateTime.utc(2026, 9, 15, 2, 0),
      isRootedDevice: true,
    );
    await queue.add(rooted);

    // Survives the round trip through storage — a punch captured offline on a
    // rooted device is still flagged when it finally syncs.
    final QueuedPunch restored = (await queue.all()).single;
    expect(restored.isRootedDevice, isTrue);
    expect(restored.toRequestBody()['isRootedDevice'], true);

    // A clean device sends nothing rather than an explicit false.
    expect(buildPunch('p-clean').toRequestBody().containsKey('isRootedDevice'), isFalse);
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
