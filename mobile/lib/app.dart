import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_config.dart';
import 'core/providers.dart';
import 'core/router/tabs.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/application/auth_controller.dart';
import 'features/auth/domain/session.dart';
import 'features/auth/presentation/login_screen.dart';

class MarMaApp extends ConsumerStatefulWidget {
  const MarMaApp({super.key});

  @override
  ConsumerState<MarMaApp> createState() => _MarMaAppState();
}

class _MarMaAppState extends ConsumerState<MarMaApp> {
  @override
  void initState() {
    super.initState();
    // Revalidate any stored session before showing the app.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authControllerProvider.notifier).bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final AuthState auth = ref.watch(authControllerProvider);

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
      locale: const Locale('th', 'TH'),
      supportedLocales: const <Locale>[Locale('th', 'TH'), Locale('en', 'US')],
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: switch (auth) {
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
/// from the user's permissions.
class HomeShell extends StatefulWidget {
  const HomeShell({required this.user, super.key});

  final SessionUser user;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final List<AppTab> tabs = visibleTabsFor(widget.user);
    final int safeIndex = _index.clamp(0, tabs.length - 1);

    return Scaffold(
      body: IndexedStack(
        index: safeIndex,
        children: tabs.map((AppTab tab) => tab.screen).toList(),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (int index) => setState(() => _index = index),
        destinations: tabs
            .map(
              (AppTab tab) => NavigationDestination(
                icon: Icon(tab.icon),
                selectedIcon: Icon(tab.selectedIcon),
                label: tab.label,
              ),
            )
            .toList(),
      ),
    );
  }
}
