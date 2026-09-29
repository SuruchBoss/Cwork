// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/server.dart';
import '../../../core/config/server_address.dart';
import '../../../core/i18n/i18n.dart';
import '../application/server_connector.dart';
import 'scan_screen.dart';

/// The first thing a new install shows: which company is this phone for?
///
/// The employee types the address HR gave them, scans HR's QR code, or arrives
/// here from the install page's "open the app" link — in which case the
/// address is already filled in and the screen only asks them to confirm it.
/// A link never connects on its own: anybody can send one.
class ConnectScreen extends ConsumerStatefulWidget {
  const ConnectScreen({super.key});

  @override
  ConsumerState<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends ConsumerState<ConnectScreen> {
  final TextEditingController _address = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Changing server starts from the current one, so a typo is a small edit.
    final String? current = ref.read(serverProvider);
    if (current != null) _address.text = Uri.parse(current).host;
  }

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  Future<void> _connect(String input) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final String? error = await ref.read(serverConnectorProvider).connect(input);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error == null && Navigator.of(context).canPop()) Navigator.of(context).pop();
  }

  Future<void> _scan() async {
    final String? scanned = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(builder: (_) => const ScanScreen()),
    );
    if (scanned == null || !mounted) return;
    _address.text = parseServerAddress(scanned, allowInsecure: true).host ?? scanned;
    await _connect(scanned);
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? pending = ref.watch(pendingServerProvider);
    final String? current = ref.watch(serverProvider);

    return Scaffold(
      appBar: Navigator.of(context).canPop() ? AppBar() : null,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Icon(Icons.apartment_outlined, size: 48, color: theme.colorScheme.primary),
                  const SizedBox(height: 16),
                  Text(
                    ref.tr('Connect to your company'),
                    style: theme.textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  if (pending != null) ..._confirm(theme, pending, current) else ..._enter(theme),
                  if (_error != null) ...<Widget>[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        _error!,
                        style: TextStyle(color: theme.colorScheme.onErrorContainer),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Arrived by a link: say exactly where it points, and ask.
  List<Widget> _confirm(ThemeData theme, String pending, String? current) {
    final String host = parseServerAddress(pending, allowInsecure: true).host ?? pending;
    return <Widget>[
      Text(
        ref.tr('Connect this app to'),
        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 6),
      Text(
        host,
        style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
        textAlign: TextAlign.center,
      ),
      if (current != null && Uri.parse(current).host != host) ...<Widget>[
        const SizedBox(height: 10),
        Text(
          ref.tr('You will be signed out of {host}.', <String, Object>{
            'host': Uri.parse(current).host,
          }),
          style: theme.textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
      ],
      const SizedBox(height: 20),
      FilledButton(
        onPressed: _busy ? null : () => _connect(pending),
        child: _busy ? const _Spinner() : Text(ref.tr('Connect')),
      ),
      const SizedBox(height: 8),
      TextButton(
        onPressed: _busy ? null : () => ref.read(pendingServerProvider.notifier).state = null,
        child: Text(ref.tr('Cancel')),
      ),
    ];
  }

  /// First launch, or changing company: type it or scan it.
  List<Widget> _enter(ThemeData theme) {
    return <Widget>[
      Text(
        ref.tr('Enter the address HR gave you, or scan their QR code.'),
        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 24),
      TextField(
        controller: _address,
        keyboardType: TextInputType.url,
        autocorrect: false,
        textInputAction: TextInputAction.go,
        onSubmitted: _busy ? null : _connect,
        decoration: InputDecoration(
          labelText: ref.tr('Company address'),
          hintText: 'hr.example.co.th',
          prefixIcon: const Icon(Icons.link),
        ),
      ),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: _busy ? null : () => _connect(_address.text),
        child: _busy ? const _Spinner() : Text(ref.tr('Connect')),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: _busy ? null : _scan,
        icon: const Icon(Icons.qr_code_scanner),
        label: Text(ref.tr('Scan QR code')),
      ),
    ];
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();

  @override
  Widget build(BuildContext context) =>
      const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2));
}
