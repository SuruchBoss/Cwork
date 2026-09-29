// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'dart:async';

import 'package:cwork/app.dart';
import 'package:cwork/core/config/server.dart';
import 'package:cwork/features/server/application/server_connector.dart';
import 'package:cwork/features/server/presentation/connect_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_secure_storage.dart';

/// The employee's side of CW-060: a fresh install asks which company, a link
/// only ever offers to connect, and the sign-in screen says which company it
/// is signing in to.
void main() {
  late StreamController<Uri> links;

  setUp(() {
    fakeSecureStorage();
    links = StreamController<Uri>.broadcast();
    addTearDown(links.close);
  });

  Future<void> launch(WidgetTester tester, {String? server}) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[
          serverProvider.overrideWith(
            (Ref ref) => ServerController(ref.watch(serverStorageProvider), server),
          ),
          serverProbeProvider.overrideWithValue((String _) async => null),
          incomingLinksProvider.overrideWithValue(links.stream),
        ],
        child: const CworkApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder button(String label) => find.widgetWithText(FilledButton, label);

  testWidgets('a fresh install asks which company before anything else', (
    WidgetTester tester,
  ) async {
    await launch(tester);

    expect(find.byType(ConnectScreen), findsOneWidget);
    expect(find.text('เชื่อมต่อกับบริษัทของคุณ'), findsOneWidget);
    expect(find.text('สแกน QR code'), findsOneWidget);
    expect(find.text('อีเมล'), findsNothing);
  });

  testWidgets('connecting leads to sign-in, which names the company', (
    WidgetTester tester,
  ) async {
    await launch(tester);

    await tester.enterText(find.byType(TextField), 'hr.example.co.th');
    await tester.tap(button('เชื่อมต่อ'));
    await tester.pumpAndSettle();

    expect(find.byType(ConnectScreen), findsNothing);
    expect(find.text('อีเมล'), findsOneWidget);
    expect(find.text('บริษัท: hr.example.co.th'), findsOneWidget);
  });

  testWidgets('an address it cannot use is explained, and nothing changes', (
    WidgetTester tester,
  ) async {
    await launch(tester);

    await tester.enterText(find.byType(TextField), 'ask HR');
    await tester.tap(button('เชื่อมต่อ'));
    await tester.pumpAndSettle();

    expect(find.byType(ConnectScreen), findsOneWidget);
    expect(find.text('ที่อยู่นี้ไม่ใช่ที่อยู่เว็บ กรุณาตรวจสอบกับ HR'), findsOneWidget);
  });

  testWidgets('an installed app opens straight to its company', (WidgetTester tester) async {
    await launch(tester, server: 'https://hr.example.co.th/api/v1');

    expect(find.byType(ConnectScreen), findsNothing);
    expect(find.text('บริษัท: hr.example.co.th'), findsOneWidget);
  });

  testWidgets('the company can be changed from the sign-in screen', (WidgetTester tester) async {
    await launch(tester, server: 'https://a.example.co.th/api/v1');

    await tester.tap(find.widgetWithText(TextButton, 'เปลี่ยน'));
    await tester.pumpAndSettle();
    // Starts from the current one, so a typo is a small edit.
    expect(find.widgetWithText(TextField, 'a.example.co.th'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'b.example.co.th');
    await tester.tap(button('เชื่อมต่อ'));
    await tester.pumpAndSettle();

    expect(find.byType(ConnectScreen), findsNothing);
    expect(find.text('บริษัท: b.example.co.th'), findsOneWidget);
  });

  group('a link from the install page', () {
    testWidgets('asks before connecting, and says who it will sign out of', (
      WidgetTester tester,
    ) async {
      await launch(tester, server: 'https://a.example.co.th/api/v1');

      links.add(Uri.parse('cwork://connect?server=https%3A%2F%2Fb.example.co.th%2Fapi%2Fv1'));
      await tester.pumpAndSettle();

      expect(find.text('เชื่อมต่อแอปนี้กับ'), findsOneWidget);
      expect(find.text('b.example.co.th'), findsOneWidget);
      expect(find.text('แอปจะออกจากระบบของ a.example.co.th'), findsOneWidget);

      await tester.tap(button('เชื่อมต่อ'));
      await tester.pumpAndSettle();

      expect(find.text('บริษัท: b.example.co.th'), findsOneWidget);
    });

    testWidgets('changes nothing when the employee cancels', (WidgetTester tester) async {
      await launch(tester, server: 'https://a.example.co.th/api/v1');

      links.add(Uri.parse('cwork://connect?server=https%3A%2F%2Fb.example.co.th%2Fapi%2Fv1'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'ยกเลิก'));
      await tester.pumpAndSettle();

      expect(find.byType(ConnectScreen), findsNothing);
      expect(find.text('บริษัท: a.example.co.th'), findsOneWidget);
    });

    testWidgets('to the company already in use just opens the app', (
      WidgetTester tester,
    ) async {
      await launch(tester, server: 'https://a.example.co.th/api/v1');

      links.add(Uri.parse('cwork://connect?server=https%3A%2F%2Fa.example.co.th%2Fapi%2Fv1'));
      await tester.pumpAndSettle();

      expect(find.byType(ConnectScreen), findsNothing);
    });

    testWidgets('other links are ignored', (WidgetTester tester) async {
      await launch(tester, server: 'https://a.example.co.th/api/v1');

      links.add(Uri.parse('https://b.example.co.th/app'));
      links.add(Uri.parse('cwork://settings'));
      await tester.pumpAndSettle();

      expect(find.byType(ConnectScreen), findsNothing);
    });
  });
}
