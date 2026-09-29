// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/i18n/i18n.dart';

/// Reads the QR code HR shows or prints, and returns what it says.
///
/// The camera is used for nothing else, and only while this screen is open.
/// Whatever the code holds goes back to the connect screen, which decides
/// whether it is a server address at all.
class ScanScreen extends ConsumerStatefulWidget {
  const ScanScreen({super.key});

  @override
  ConsumerState<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends ConsumerState<ScanScreen> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const <BarcodeFormat>[BarcodeFormat.qrCode],
  );
  bool _done = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_done) return;
    for (final Barcode barcode in capture.barcodes) {
      final String? value = barcode.rawValue;
      if (value != null && value.isNotEmpty) {
        _done = true;
        Navigator.of(context).pop(value);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(ref.tr('Scan the QR code from HR'))),
      body: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (BuildContext context, MobileScannerException error) => _ScanError(
              message: error.errorCode == MobileScannerErrorCode.permissionDenied
                  ? ref.tr('The camera is not allowed. You can type the address instead.')
                  : ref.tr('The camera could not start. You can type the address instead.'),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  ref.tr('Point the camera at the code on the poster or on HR’s screen'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 15),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScanError extends ConsumerWidget {
  const _ScanError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(Icons.no_photography_outlined, color: Colors.white, size: 40),
              const SizedBox(height: 12),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(ref.tr('Type the address')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
