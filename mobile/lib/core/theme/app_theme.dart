// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';

/// Light and dark themes built from one seed colour, so the two stay in step.
class AppTheme {
  const AppTheme._();

  static const Color seed = Color(0xFF1F5FD0);

  static ThemeData light() => _build(Brightness.light);

  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final ColorScheme scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: brightness,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor:
          brightness == Brightness.light ? const Color(0xFFF6F7F9) : const Color(0xFF0F1116),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 1,
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        color: scheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        side: BorderSide.none,
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, thickness: 1, space: 1),
      navigationBarTheme: NavigationBarThemeData(
        height: 66,
        elevation: 2,
        backgroundColor: scheme.surface,
        indicatorColor: scheme.primaryContainer,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),
    );
  }
}

/// Semantic colours for status chips: green for done, amber for waiting, red
/// for refused, blue for information — the same meanings as the web console.
///
/// These are fixed rather than taken from the seeded scheme. The scheme's
/// tertiary colour is what "success" used to borrow, and from this seed it is
/// pink, so an approved leave request and a day at work read as a warning.
class StatusColors {
  const StatusColors._();

  static Color background(BuildContext context, String status) {
    final bool dark = Theme.of(context).brightness == Brightness.dark;
    return switch (_tone(status)) {
      _Tone.success => dark ? const Color(0xFF142B20) : const Color(0xFFE3F5EC),
      _Tone.warning => dark ? const Color(0xFF2E2314) : const Color(0xFFFDF1DF),
      _Tone.danger => dark ? const Color(0xFF331A1A) : const Color(0xFFFDEAEA),
      _Tone.info => dark ? const Color(0xFF14282F) : const Color(0xFFE2F3F8),
      _Tone.neutral => Theme.of(context).colorScheme.surfaceContainerHighest,
    };
  }

  static Color foreground(BuildContext context, String status) {
    final bool dark = Theme.of(context).brightness == Brightness.dark;
    return switch (_tone(status)) {
      _Tone.success => dark ? const Color(0xFF4EC98D) : const Color(0xFF16794A),
      _Tone.warning => dark ? const Color(0xFFE0A04A) : const Color(0xFFA35A00),
      _Tone.danger => dark ? const Color(0xFFF3736F) : const Color(0xFFC02626),
      _Tone.info => dark ? const Color(0xFF57BCD8) : const Color(0xFF0E6F8A),
      _Tone.neutral => Theme.of(context).colorScheme.onSurfaceVariant,
    };
  }

  static _Tone _tone(String status) => switch (status) {
        'APPROVED' || 'PRESENT' || 'ACTIVE' || 'PAID' || 'ISSUED' || 'DONE' => _Tone.success,
        'PENDING' ||
        'PENDING_APPROVAL' ||
        'LATE' ||
        'EARLY_LEAVE' ||
        'PROBATION' ||
        'INCOMPLETE' =>
          _Tone.warning,
        'REJECTED' || 'ABSENT' || 'FAILED' || 'CANCELLED_AFTER_APPROVAL' => _Tone.danger,
        'ON_LEAVE' || 'CALCULATED' => _Tone.info,
        _ => _Tone.neutral,
      };
}

/// The clock-out button. Clocking in is the primary colour; clocking out is a
/// different, warm colour so the two are told apart at a glance, and not red,
/// which would read as an error.
class ClockOutColors {
  const ClockOutColors._();

  static Color background(BuildContext context) => Theme.of(context).brightness == Brightness.dark
      ? const Color(0xFFF0A05A)
      : const Color(0xFFC2410C);

  static Color foreground(BuildContext context) => Theme.of(context).brightness == Brightness.dark
      ? const Color(0xFF1F1206)
      : const Color(0xFFFFFFFF);
}

enum _Tone { success, warning, danger, info, neutral }
