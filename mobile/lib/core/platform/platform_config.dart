// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';

/// What the deployment this app is pointed at actually offers.
///
/// Permissions answer "may this person"; this answers "does this installation
/// have it at all". `ASSISTANT_ENABLED=false` is the server's default and every
/// role carries `assistant:use`, so without this the standard install put an
/// assistant tab in front of every employee that could only ever fail.
class PlatformConfig {
  const PlatformConfig({required this.assistantEnabled});

  /// What to assume before the server has answered, and if it never does:
  /// hiding a feature that turns out to be available is a smaller wrong than
  /// offering one that is not.
  const PlatformConfig.unknown() : assistantEnabled = false;

  factory PlatformConfig.fromJson(Map<String, dynamic> json) =>
      PlatformConfig(assistantEnabled: json['assistantEnabled'] as bool? ?? false);

  final bool assistantEnabled;
}

/// Fetched once per launch — it is fixed by the server's environment, so there
/// is nothing to refresh. The endpoint is public, so this works before sign-in.
final FutureProvider<PlatformConfig> platformConfigProvider =
    FutureProvider<PlatformConfig>((Ref ref) async {
  final Map<String, dynamic> json =
      await ref.watch(apiClientProvider).get<Map<String, dynamic>>('/config');
  return PlatformConfig.fromJson(json);
});

/// The flag on its own, resolved rather than pending: navigation has to draw
/// something now, and `false` is the safe thing to draw.
final Provider<bool> assistantEnabledProvider = Provider<bool>((Ref ref) {
  return ref
      .watch(platformConfigProvider)
      .maybeWhen(data: (PlatformConfig config) => config.assistantEnabled, orElse: () => false);
});
