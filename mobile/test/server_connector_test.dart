// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:cwork/core/config/server.dart';
import 'package:cwork/core/storage/token_storage.dart';
import 'package:cwork/features/attendance/data/punch_queue.dart';
import 'package:cwork/features/attendance/domain/attendance_models.dart';
import 'package:cwork/features/server/application/server_connector.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_secure_storage.dart';

const String companyA = 'https://a.example.co.th/api/v1';
const String companyB = 'https://b.example.co.th/api/v1';

final ProviderFamily<ServerConnector, bool> _connector = Provider.family<ServerConnector, bool>(
  (Ref ref, bool allowInsecure) => ServerConnector(ref, allowInsecure: allowInsecure),
);

QueuedPunch _punch(String id) => QueuedPunch(
      clientPunchId: id,
      type: 'CLOCK_IN',
      capturedAt: DateTime.utc(2026, 9, 29, 1, 0),
    );

/// Connecting an install to a company (CW-060): what is refused, what is kept,
/// and what is wiped when the employee changes company.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Map<String, String> store;
  late List<String> asked;
  ServerProbeProblem? answer;

  setUp(() {
    store = fakeSecureStorage();
    asked = <String>[];
    answer = null;
  });

  ProviderContainer app({String? server}) {
    if (server != null) store['cwork.server'] = server;
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        serverProvider.overrideWith(
          (Ref ref) => ServerController(ref.watch(serverStorageProvider), server),
        ),
        serverProbeProvider.overrideWithValue((String apiBaseUrl) async {
          asked.add(apiBaseUrl);
          return answer;
        }),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  Future<String?> connect(ProviderContainer c, String input, {bool allowInsecure = false}) =>
      c.read(_connector(allowInsecure)).connect(input);

  Future<void> signIn() =>
      TokenStorage().saveTokens(accessToken: 'access', refreshToken: 'refresh');

  test('connects to a Cwork server over HTTPS and remembers it', () async {
    final ProviderContainer c = app();

    expect(await connect(c, 'a.example.co.th'), isNull);

    expect(asked, <String>[companyA]);
    expect(c.read(serverProvider), companyA);
    expect(store['cwork.server'], companyA);
  });

  test('refuses plain HTTP in a release build without asking anybody', () async {
    final ProviderContainer c = app();

    final String? error = await connect(c, 'http://a.example.co.th');

    expect(error, contains('https://'));
    expect(asked, isEmpty);
    expect(c.read(serverProvider), isNull);
    expect(store, isNot(contains('cwork.server')));
  });

  test('a debug build may connect over HTTP, for a developer machine', () async {
    final ProviderContainer c = app();

    expect(await connect(c, 'http://10.0.2.2:3000', allowInsecure: true), isNull);
    expect(c.read(serverProvider), 'http://10.0.2.2:3000/api/v1');
  });

  test('says why, and names the server, when it is not a Cwork server it can use', () async {
    for (final ServerProbeProblem problem in ServerProbeProblem.values) {
      final ProviderContainer c = app();
      answer = problem;

      final String? error = await connect(c, 'a.example.co.th');

      expect(error, contains('a.example.co.th'), reason: problem.name);
      expect(c.read(serverProvider), isNull, reason: problem.name);
      expect(store, isNot(contains('cwork.server')), reason: problem.name);
    }
  });

  test('something that is not an address is refused before anything is asked', () async {
    final ProviderContainer c = app();

    expect(await connect(c, ''), isNotNull);
    expect(await connect(c, 'ask HR'), isNotNull);
    expect(asked, isEmpty);
  });

  group('changing company', () {
    test('signs out of the old one, so its token is never sent to the new one', () async {
      final ProviderContainer c = app(server: companyA);
      await signIn();

      expect(await connect(c, 'b.example.co.th'), isNull);

      expect(c.read(serverProvider), companyB);
      expect(store['cwork.server'], companyB);
      expect(await TokenStorage().readAccessToken(), isNull);
      expect(await TokenStorage().readRefreshToken(), isNull);
    });

    test('keeps the old company while punches are still waiting to be sent to it', () async {
      final ProviderContainer c = app(server: companyA);
      await signIn();
      await PunchQueue().add(_punch('p1'));
      await PunchQueue().add(_punch('p2'));

      final String? error = await connect(c, 'b.example.co.th');

      expect(error, allOf(contains('2'), contains('a.example.co.th')));
      expect(asked, isEmpty);
      expect(c.read(serverProvider), companyA);
      expect(await TokenStorage().readAccessToken(), 'access');
      expect(await PunchQueue().count(), 2);
    });

    test('a failed switch leaves the employee signed in where they were', () async {
      final ProviderContainer c = app(server: companyA);
      await signIn();
      answer = ServerProbeProblem.unreachable;

      expect(await connect(c, 'b.example.co.th'), isNotNull);

      expect(c.read(serverProvider), companyA);
      expect(await TokenStorage().readAccessToken(), 'access');
    });

    test('connecting to the same company again keeps the session and the queue', () async {
      final ProviderContainer c = app(server: companyA);
      await signIn();
      await PunchQueue().add(_punch('p1'));

      expect(await connect(c, 'https://a.example.co.th/app'), isNull);

      expect(await TokenStorage().readAccessToken(), 'access');
      expect(await PunchQueue().count(), 1);
    });
  });

  test('a link waiting to be confirmed is cleared once it is', () async {
    final ProviderContainer c = app();
    c.read(pendingServerProvider.notifier).state = 'cwork://connect?server=$companyA';

    expect(await connect(c, c.read(pendingServerProvider)!), isNull);

    expect(c.read(pendingServerProvider), isNull);
    expect(c.read(serverProvider), companyA);
  });

  test('an update finds the company, the session and the queued punches it left', () async {
    // What the previous version left in the keystore — which an update over it
    // keeps, since the app id and the signing key are the same.
    store['cwork.server'] = companyA;
    await signIn();
    await PunchQueue().add(_punch('p1'));

    expect(await loadSavedServer(), companyA);
    expect(await TokenStorage().readAccessToken(), 'access');
    expect(await PunchQueue().count(), 1);
  });

  test('a fresh install has no company until the employee picks one', () async {
    expect(await loadSavedServer(), isNull);
  });
}
