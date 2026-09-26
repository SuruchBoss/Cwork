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

/// Semantic colours for status chips, resolved against the active scheme so
/// they stay legible in both themes.
class StatusColors {
  const StatusColors._();

  static Color background(BuildContext context, String status) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return switch (_tone(status)) {
      _Tone.success => scheme.tertiaryContainer,
      _Tone.warning => scheme.secondaryContainer,
      _Tone.danger => scheme.errorContainer,
      _Tone.info => scheme.primaryContainer,
      _Tone.neutral => scheme.surfaceContainerHighest,
    };
  }

  static Color foreground(BuildContext context, String status) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return switch (_tone(status)) {
      _Tone.success => scheme.onTertiaryContainer,
      _Tone.warning => scheme.onSecondaryContainer,
      _Tone.danger => scheme.onErrorContainer,
      _Tone.info => scheme.onPrimaryContainer,
      _Tone.neutral => scheme.onSurfaceVariant,
    };
  }

  static _Tone _tone(String status) => switch (status) {
        'APPROVED' || 'PRESENT' || 'ACTIVE' || 'PAID' || 'ISSUED' => _Tone.success,
        'PENDING' || 'LATE' || 'PROBATION' || 'INCOMPLETE' => _Tone.warning,
        'REJECTED' || 'ABSENT' || 'FAILED' || 'CANCELLED_AFTER_APPROVAL' => _Tone.danger,
        'ON_LEAVE' || 'CALCULATED' => _Tone.info,
        _ => _Tone.neutral,
      };
}

enum _Tone { success, warning, danger, info, neutral }
