// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:cwork/features/attendance/data/device_integrity.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const MethodChannel channel = MethodChannel('safe_device');

  void mock(Future<Object?> Function(MethodCall call) handler) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, handler);
  }

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  group('PlatformDeviceIntegrity', () {
    test('reports not-rooted rather than throwing when detection fails', () async {
      // Detection erroring out must never cost an employee their clock-in: the
      // wrapper absorbs it and answers "not rooted" (CW-025).
      mock((MethodCall call) async {
        if (call.method == 'isJailBroken') throw PlatformException(code: 'unavailable');
        return null;
      });

      const DeviceIntegrity integrity = PlatformDeviceIntegrity();
      expect(await integrity.isRooted(), isFalse);
    });

    test('surfaces a positive root/jailbreak detection', () async {
      mock((MethodCall call) async => call.method == 'isJailBroken' ? true : null);

      const DeviceIntegrity integrity = PlatformDeviceIntegrity();
      expect(await integrity.isRooted(), isTrue);
    });
  });
}
