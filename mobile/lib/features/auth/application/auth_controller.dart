import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/auth_repository.dart';
import '../domain/session.dart';

final Provider<AuthRepository> authRepositoryProvider = Provider<AuthRepository>((Ref ref) {
  return AuthRepository(
    api: ref.watch(apiClientProvider),
    tokenStorage: ref.watch(tokenStorageProvider),
  );
});

/// Session state. `AsyncValue` carries loading and error for free, so the UI
/// never has to track three booleans by hand.
sealed class AuthState {
  const AuthState();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class AuthSignedOut extends AuthState {
  const AuthSignedOut({this.message});
  final String? message;
}

class AuthSignedIn extends AuthState {
  const AuthSignedIn(this.user);
  final SessionUser user;
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repository) : super(const AuthLoading());

  final AuthRepository _repository;

  /// Revalidates a stored session on launch: a token on disk proves nothing,
  /// so ask the server who we are before showing the app.
  Future<void> bootstrap() async {
    if (!await _repository.hasStoredSession()) {
      state = const AuthSignedOut();
      return;
    }
    try {
      state = AuthSignedIn(await _repository.me());
    } on Object {
      state = const AuthSignedOut();
    }
  }

  Future<void> login({required String email, required String password}) async {
    state = const AuthLoading();
    state = AuthSignedIn(await _repository.login(email: email, password: password));
  }

  Future<void> logout() async {
    await _repository.logout();
    state = const AuthSignedOut();
  }

  void expire() {
    state = const AuthSignedOut(message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
  }
}

final StateNotifierProvider<AuthController, AuthState> authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((Ref ref) {
  return AuthController(ref.watch(authRepositoryProvider));
});

/// Convenience: the signed-in user, or null.
final Provider<SessionUser?> currentUserProvider = Provider<SessionUser?>((Ref ref) {
  final AuthState state = ref.watch(authControllerProvider);
  return state is AuthSignedIn ? state.user : null;
});
