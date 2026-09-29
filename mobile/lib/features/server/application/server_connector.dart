// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/server.dart';
import '../../../core/config/server_address.dart';
import '../../../core/i18n/i18n.dart';
import '../../../core/providers.dart';
import '../../attendance/data/punch_queue.dart';

/// Asks a server whether it is Cwork. A provider so tests can answer for it.
final Provider<Future<ServerProbeProblem?> Function(String apiBaseUrl)> serverProbeProvider =
    Provider<Future<ServerProbeProblem?> Function(String)>((Ref ref) => probeServer);

final Provider<PunchQueue> punchQueueProvider = Provider<PunchQueue>((Ref ref) => PunchQueue());

/// Connects this install to a company's server (CW-060).
///
/// Every refusal comes back as a sentence the employee can act on — they are
/// standing in front of HR with a phone, not reading logs. In order:
///
/// 1. the address must read as one, over HTTPS (plain HTTP only in a debug
///    build);
/// 2. an install that already has a server keeps it while punches are still
///    queued for it: sending them to another company, or dropping them, would
///    both be wrong;
/// 3. the server must answer `/config` the way a Cwork server does, over a
///    certificate the phone trusts;
/// 4. switching servers signs out of the old one first, so no token from one
///    company is ever presented to another.
class ServerConnector {
  ServerConnector(this._ref, {this.allowInsecure = kDebugMode});

  final Ref _ref;

  /// Plain HTTP: a debug build only. A parameter so a test — which always runs
  /// in debug — can check the release build's refusal.
  final bool allowInsecure;

  /// Null when connected; otherwise why not.
  Future<String?> connect(String input) async {
    final ServerAddress address = parseServerAddress(input, allowInsecure: allowInsecure);
    final String? apiBaseUrl = address.apiBaseUrl;
    if (apiBaseUrl == null) {
      return switch (address.problem!) {
        ServerAddressProblem.empty => tr0('Enter the address HR gave you'),
        ServerAddressProblem.invalid => tr0('That is not a web address. Check it with HR.'),
        ServerAddressProblem.insecure =>
          tr0('The address must start with https://. Ask HR for the secure address.'),
      };
    }

    final String? current = _ref.read(serverProvider);
    final bool switching = current != null && current != apiBaseUrl;
    if (switching) {
      final int waiting = await _ref.read(punchQueueProvider).count();
      if (waiting > 0) {
        return tr0(
          '{n} punches have not been sent to {host} yet. Open the app with an internet '
          'connection so they are sent, then change the server.',
          <String, Object>{'n': waiting, 'host': Uri.parse(current).host},
        );
      }
    }

    final String host = address.host!;
    final ServerProbeProblem? problem = await _ref.read(serverProbeProvider)(apiBaseUrl);
    if (problem != null) {
      return switch (problem) {
        ServerProbeProblem.unreachable => tr0(
            'Could not reach {host}. Check the address and your internet connection.',
            <String, Object>{'host': host},
          ),
        ServerProbeProblem.untrustedCertificate => tr0(
            '{host} does not have a certificate this phone trusts. The company’s IT team '
            'needs to fix the server’s HTTPS certificate.',
            <String, Object>{'host': host},
          ),
        ServerProbeProblem.notCwork => tr0(
            '{host} answered, but it is not a Cwork server. Check the address with HR.',
            <String, Object>{'host': host},
          ),
      };
    }

    if (switching) {
      // Local only: the old server may be the one that cannot be reached.
      await _ref.read(tokenStorageProvider).clear();
    }
    await _ref.read(serverProvider.notifier).connect(apiBaseUrl);
    _ref.read(pendingServerProvider.notifier).state = null;
    return null;
  }
}

final Provider<ServerConnector> serverConnectorProvider =
    Provider<ServerConnector>((Ref ref) => ServerConnector(ref));
