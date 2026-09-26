// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/i18n/i18n.dart';
import '../application/auth_controller.dart';
import '../domain/session.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();

  bool _obscure = true;
  bool _busy = false;
  String? _error;

  /// Set once the password is accepted but a second factor is still owed. Held
  /// in memory only: a challenge is not a session and must not outlive the
  /// screen.
  MfaRequired? _challenge;
  final TextEditingController _code = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final MfaRequired? challenge = await ref.read(authControllerProvider.notifier).login(
            email: _email.text,
            password: _password.text,
          );
      if (challenge != null && mounted) {
        setState(() => _challenge = challenge);
      }
    } on Object catch (error) {
      // Surface the server's message: it distinguishes a locked account from
      // bad credentials, which matters to someone genuinely locked out.
      final String raw = error.toString();
      final int separator = raw.indexOf(': ');
      if (mounted) {
        setState(() => _error = separator >= 0 ? raw.substring(separator + 2) : raw);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitCode() async {
    final MfaRequired? challenge = _challenge;
    if (challenge == null || _code.text.trim().isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(authControllerProvider.notifier).verifyMfa(
            challengeToken: challenge.challengeToken,
            code: _code.text,
          );
    } on Object catch (error) {
      final String raw = error.toString();
      final int separator = raw.indexOf(': ');
      if (mounted) {
        setState(() => _error = separator >= 0 ? raw.substring(separator + 2) : raw);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    // Centred rather than bare: the surrounding Column
                    // stretches its children across the cross axis, which
                    // silently overrode the 56-wide square and drew the mark as
                    // a full-width bar.
                    Center(
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          'CW',
                          style: TextStyle(
                            color: theme.colorScheme.onPrimary,
                            fontWeight: FontWeight.w700,
                            fontSize: 20,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(AppConfig.appName, style: theme.textTheme.headlineSmall),
                    const SizedBox(height: 4),
                    Text(
                      ref.tr('Sign in with your employee account'),
                      style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                    ),
                    const SizedBox(height: 28),
                    if (_challenge != null)
                      _MfaFields(
                        challenge: _challenge!,
                        controller: _code,
                        onSubmit: _submitCode,
                      )
                    else ...<Widget>[
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const <String>[AutofillHints.username],
                        textInputAction: TextInputAction.next,
                        decoration: InputDecoration(
                          labelText: ref.tr('Email'),
                          prefixIcon: const Icon(Icons.mail_outline),
                        ),
                        validator: (String? value) {
                          final String email = (value ?? '').trim();
                          if (email.isEmpty) return ref.tr('Please enter your email');
                          if (!email.contains('@')) return ref.tr('Invalid email');
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        autofillHints: const <String>[AutofillHints.password],
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          labelText: ref.tr('Password'),
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            onPressed: () => setState(() => _obscure = !_obscure),
                            icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                            tooltip: _obscure ? ref.tr('Show password') : ref.tr('Hide password'),
                          ),
                        ),
                        validator: (String? value) =>
                            (value ?? '').isEmpty ? ref.tr('Please enter your password') : null,
                      ),
                    ],
                    if (_error != null) ...<Widget>[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.errorContainer,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: <Widget>[
                            Icon(
                              Icons.error_outline,
                              size: 18,
                              color: theme.colorScheme.onErrorContainer,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _error!,
                                style: TextStyle(color: theme.colorScheme.onErrorContainer),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : (_challenge == null
                              ? _submit
                              : (_challenge!.enrolled ? _submitCode : null)),
                      child: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(_challenge == null ? ref.tr('Sign in') : ref.tr('Verify')),
                    ),
                    if (_challenge != null) ...<Widget>[
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _challenge = null;
                                  _code.clear();
                                  _error = null;
                                }),
                        child: Text(ref.tr('Back')),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Second-factor step.
///
/// Entering a code is supported; *enrolling* is not — scanning a QR code with
/// the same phone that is displaying it does not work, so an account that still
/// has to set up a second factor is sent to the web console. See CW-021.
class _MfaFields extends ConsumerWidget {
  const _MfaFields({
    required this.challenge,
    required this.controller,
    required this.onSubmit,
  });

  final MfaRequired challenge;
  final TextEditingController controller;
  final Future<void> Function() onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);

    if (!challenge.enrolled) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: theme.colorScheme.secondaryContainer,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          ref.tr(
            'This account must set up two-step verification first. '
            'Please set it up in the web console, then sign in again.',
          ),
          style: TextStyle(color: theme.colorScheme.onSecondaryContainer),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          ref.tr('Enter the 6-digit code from your authenticator app or a recovery code'),
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: controller,
          // Not a number field: leading zeros matter, and recovery codes are
          // not digits at all.
          keyboardType: TextInputType.text,
          autofocus: true,
          autofillHints: const <String>[AutofillHints.oneTimeCode],
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => onSubmit(),
          decoration: InputDecoration(
            labelText: ref.tr('Verification code'),
            prefixIcon: const Icon(Icons.shield_outlined),
            hintText: '123456',
          ),
        ),
      ],
    );
  }
}
