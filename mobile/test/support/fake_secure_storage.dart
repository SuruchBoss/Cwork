// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Stands flutter_secure_storage's platform channel up on a plain Map, which
/// is returned so a test can see what was kept — and put things there first,
/// the way a previous version of the app would have left them.
Map<String, String> fakeSecureStorage() {
  const MethodChannel channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  final Map<String, String> store = <String, String>{};
  final TestDefaultBinaryMessenger messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  messenger.setMockMethodCallHandler(channel, (MethodCall call) async {
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
  addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
  return store;
}
