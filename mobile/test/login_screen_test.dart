import 'package:cwork/core/theme/app_theme.dart';
import 'package:cwork/features/auth/presentation/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Regression guard for a bug nothing but looking at the app would catch.
///
/// The "CW" mark is a 56×56 square. It sat directly inside a Column with
/// `crossAxisAlignment: CrossAxisAlignment.stretch`, which forces every child
/// to fill the cross axis and silently overrode the width — so the square
/// rendered as a full-width bar on every device. It compiled, it analysed
/// clean, and all thirty other tests passed.
void main() {
  Future<void> pumpLogin(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(theme: AppTheme.light(), home: const LoginScreen()),
      ),
    );
    await tester.pump();
  }

  testWidgets('the logo stays a square instead of stretching across the screen', (
    WidgetTester tester,
  ) async {
    await pumpLogin(tester);

    final Size logo = tester.getSize(
      find.ancestor(of: find.text('CW'), matching: find.byType(Container)).first,
    );

    expect(logo.width, 56);
    expect(logo.height, 56);
  });

  testWidgets('the logo is narrower than the form it sits above', (WidgetTester tester) async {
    // The assertion that actually failed before: whatever the screen width, the
    // mark must not grow to match it.
    await pumpLogin(tester);

    final double screenWidth = tester.getSize(find.byType(LoginScreen)).width;
    final Size logo = tester.getSize(
      find.ancestor(of: find.text('CW'), matching: find.byType(Container)).first,
    );

    expect(logo.width, lessThan(screenWidth / 2));
  });

  testWidgets('sign-in asks for an email and a password', (WidgetTester tester) async {
    await pumpLogin(tester);

    expect(find.text('อีเมล'), findsOneWidget);
    expect(find.text('รหัสผ่าน'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'เข้าสู่ระบบ'), findsOneWidget);
  });
}
