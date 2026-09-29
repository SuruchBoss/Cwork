// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_config.dart';
import 'core/config/server.dart';
import 'core/config/server_address.dart';
import 'core/i18n/i18n.dart';
import 'core/platform/platform_config.dart';
import 'core/providers.dart';
import 'core/router/tabs.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/application/auth_controller.dart';
import 'features/auth/domain/session.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/server/presentation/connect_screen.dart';

/// Links that open the app: the install page's "open the app" button, which
/// carries the company's server (CW-060). A provider so tests can send one.
final Provider<Stream<Uri>> incomingLinksProvider =
    Provider<Stream<Uri>>((Ref ref) => AppLinks().uriLinkStream);

class CworkApp extends ConsumerStatefulWidget {
  const CworkApp({super.key});

  @override
  ConsumerState<CworkApp> createState() => _CworkAppState();
}

class _CworkAppState extends ConsumerState<CworkApp> {
  StreamSubscription<Uri>? _links;

  @override
  void initState() {
    super.initState();
    // Revalidate any stored session before showing the app — once there is a
    // server to ask. Until then the connect screen is showing, and connecting
    // bootstraps (below).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ref.read(serverProvider) != null) {
        ref.read(authControllerProvider.notifier).bootstrap();
      }
    });
    _links = ref.read(incomingLinksProvider).listen(_onLink, onError: (Object _) {});
  }

  @override
  void dispose() {
    _links?.cancel();
    super.dispose();
  }

  /// A `cwork://connect` link is only ever a suggestion: it is held for the
  /// employee to confirm, never acted on, because anybody can send one. A
  /// link to the server already in use is simply the app being opened.
  void _onLink(Uri link) {
    if (link.scheme != 'cwork') return;
    final String? apiBaseUrl = parseServerAddress(
      link.toString(),
      allowInsecure: true,
    ).apiBaseUrl;
    if (apiBaseUrl == null || apiBaseUrl == ref.read(serverProvider)) return;
    ref.read(pendingServerProvider.notifier).state = link.toString();
  }

  @override
  Widget build(BuildContext context) {
    final AuthState auth = ref.watch(authControllerProvider);
    final String? server = ref.watch(serverProvider);
    final bool linkWaiting = ref.watch(pendingServerProvider) != null;

    // A new server means a new API client, and with it a new auth controller
    // that has not asked anybody anything yet. Listened to by instance rather
    // than on the server itself: the server changes first, and the controller
    // is only rebuilt after.
    ref.listen<AuthController>(authControllerProvider.notifier, (
      AuthController? previous,
      AuthController next,
    ) {
      if (previous != next && ref.read(serverProvider) != null) next.bootstrap();
    });

    // The API client flips this when a refresh fails; drop to the sign-in screen.
    ref.listen<bool>(sessionExpiredProvider, (bool? _, bool expired) {
      if (expired) {
        ref.read(authControllerProvider.notifier).expire();
        ref.read(sessionExpiredProvider.notifier).state = false;
      }
    });

    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      locale: localeFor(ref.watch(languageProvider)),
      supportedLocales: const <Locale>[Locale('th', 'TH'), Locale('en', 'US')],
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: switch (auth) {
        _ when server == null || linkWaiting => const ConnectScreen(),
        AuthLoading() => const _SplashScreen(),
        AuthSignedOut(message: final String? message) => _LoginWithMessage(message: message),
        AuthSignedIn(user: final SessionUser user) => HomeShell(user: user),
      },
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}

class _LoginWithMessage extends StatefulWidget {
  const _LoginWithMessage({this.message});

  final String? message;

  @override
  State<_LoginWithMessage> createState() => _LoginWithMessageState();
}

class _LoginWithMessageState extends State<_LoginWithMessage> {
  @override
  void initState() {
    super.initState();
    final String? message = widget.message;
    if (message != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      });
    }
  }

  @override
  Widget build(BuildContext context) => const LoginScreen();
}

/// Bottom-navigation shell. Tabs come from `visibleTabsFor`, which derives them
/// from the user's permissions and from what this deployment has switched on.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({required this.user, super.key});

  final SessionUser user;

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  /// The selection is held as a tab id rather than an index because the tab
  /// list is not fixed: the deployment's feature flags arrive a moment after
  /// launch, and an index would then be pointing at whatever moved into that
  /// slot. An id survives the list changing shape underneath it.
  String _selected = 'home';

  @override
  Widget build(BuildContext context) {
    final List<AppTab> tabs = visibleTabsFor(
      widget.user,
      assistantEnabled: ref.watch(assistantEnabledProvider),
    );
    // A tab that has gone away falls back to the first, which is always home.
    final int found = tabs.indexWhere((AppTab tab) => tab.id == _selected);
    final int safeIndex = found < 0 ? 0 : found;

    return Scaffold(
      body: IndexedStack(
        index: safeIndex,
        children: tabs.map((AppTab tab) => tab.screen).toList(),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (int index) => setState(() => _selected = tabs[index].id),
        destinations: tabs
            .map(
              (AppTab tab) => NavigationDestination(
                icon: Icon(tab.icon),
                selectedIcon: Icon(tab.selectedIcon),
                label: ref.tr(tab.label),
              ),
            )
            .toList(),
      ),
    );
  }
}
