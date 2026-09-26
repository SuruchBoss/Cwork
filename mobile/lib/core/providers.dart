// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'network/api_client.dart';
import 'storage/token_storage.dart';

/// Root providers.
///
/// Riverpod without code generation: these are plain providers, which keeps the
/// project buildable with `flutter run` alone — no build_runner step for a
/// contributor to forget.
final Provider<TokenStorage> tokenStorageProvider =
    Provider<TokenStorage>((Ref ref) => TokenStorage());

/// Set to true by the API client when a refresh fails; the router watches it
/// and sends the user back to sign-in.
final StateProvider<bool> sessionExpiredProvider = StateProvider<bool>((Ref ref) => false);

final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((Ref ref) {
  return ApiClient(
    tokenStorage: ref.watch(tokenStorageProvider),
    onSessionExpired: () => ref.read(sessionExpiredProvider.notifier).state = true,
  );
});
