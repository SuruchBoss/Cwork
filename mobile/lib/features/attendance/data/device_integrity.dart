// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:safe_device/safe_device.dart';

/// Reports whether the device's OS integrity is compromised (rooted on Android,
/// jailbroken on iOS), so a punch from it can be flagged `ROOTED_DEVICE` for a
/// manager to review (CW-025).
///
/// It is advisory, never a gate: an employee on a rooted phone must still be
/// able to clock in and prove they turned up. And it is defensive by
/// construction — any platform error, or the missing method channel under
/// `flutter test`, is read as "not detected" rather than allowed to break a
/// clock-in.
abstract class DeviceIntegrity {
  Future<bool> isRooted();
}

class PlatformDeviceIntegrity implements DeviceIntegrity {
  const PlatformDeviceIntegrity();

  @override
  Future<bool> isRooted() async {
    try {
      return await SafeDevice.isJailBroken;
    } on Object {
      // Detection failing must never cost someone their attendance record.
      return false;
    }
  }
}
