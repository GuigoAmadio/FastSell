import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/biometric_service.dart';
import '../../core/secure_storage.dart';
import 'auth_repository.dart';
import 'models.dart';

final secureStorageProvider = Provider((ref) => SecureStorageService());
final biometricServiceProvider = Provider((ref) => BiometricService());

final apiClientProvider = Provider((ref) {
  return ApiClient(ref.watch(secureStorageProvider));
});

final authRepositoryProvider = Provider((ref) {
  return AuthRepository(
    ref.watch(apiClientProvider),
    ref.watch(secureStorageProvider),
  );
});

enum AuthStatus { unknown, unauthenticated, authenticated }

class AuthState {
  final AuthStatus status;
  final AuthUser? user;
  final String? error;
  final TwoFactorChallenge? pending2fa;
  final bool loading;
  final int? lockRemainingSeconds;
  final String? pendingResetToken;

  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.error,
    this.pending2fa,
    this.loading = false,
    this.lockRemainingSeconds,
    this.pendingResetToken,
  });

  AuthState copyWith({
    AuthStatus? status,
    AuthUser? user,
    String? error,
    TwoFactorChallenge? pending2fa,
    bool clearPending2fa = false,
    bool clearError = false,
    bool? loading,
    int? lockRemainingSeconds,
    bool clearLock = false,
    String? pendingResetToken,
    bool clearResetToken = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      error: clearError ? null : (error ?? this.error),
      pending2fa: clearPending2fa ? null : (pending2fa ?? this.pending2fa),
      loading: loading ?? this.loading,
      lockRemainingSeconds:
          clearLock ? null : (lockRemainingSeconds ?? this.lockRemainingSeconds),
      pendingResetToken:
          clearResetToken ? null : (pendingResetToken ?? this.pendingResetToken),
    );
  }
}

class AuthController extends Notifier<AuthState> {
  AuthRepository get _repo => ref.read(authRepositoryProvider);
  SecureStorageService get _storage => ref.read(secureStorageProvider);
  BiometricService get _biometrics => ref.read(biometricServiceProvider);

  @override
  AuthState build() {
    SchedulerBinding.instance.scheduleFrameCallback((_) {
      Future.microtask(bootstrap);
    });
    return const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<void> bootstrap() async {
    state = state.copyWith(loading: true, clearError: true, clearLock: true);
    try {
      final refresh = await _storage.getRefreshToken();
      if (refresh == null || refresh.isEmpty) {
        state = const AuthState(status: AuthStatus.unauthenticated);
        return;
      }

      final biometricEnabled = await _storage.isBiometricEnabled();
      if (biometricEnabled) {
        final available = await _biometrics.isAvailable().timeout(
          const Duration(seconds: 2),
          onTimeout: () => false,
        );
        if (available) {
          final ok = await _biometrics.authenticate(
            reason: 'Entre no FastSell com biometria',
            biometricOnly: true,
          );
          if (!ok) {
            await _storage.clearTokens();
            state = const AuthState(
              status: AuthStatus.unauthenticated,
              error: 'Biometria falhou. Faça login com senha.',
            );
            return;
          }
        }
      }

      final tokens = await _repo.refreshWithStoredToken();
      state = AuthState(
        status: AuthStatus.authenticated,
        user: tokens.user,
      );
    } catch (_) {
      await _storage.clearTokens();
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  /// Fallback explícito: descarta tokens e abre login por senha.
  Future<void> usePasswordInsteadOfBiometric() async {
    await _storage.clearTokens();
    state = const AuthState(
      status: AuthStatus.unauthenticated,
      error: 'Entre com e-mail e senha.',
    );
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(
      loading: true,
      clearError: true,
      clearPending2fa: true,
      clearLock: true,
    );
    try {
      final result = await _repo.login(email, password);
      if (result is TwoFactorChallenge) {
        state = state.copyWith(
          loading: false,
          status: AuthStatus.unauthenticated,
          pending2fa: result,
        );
        return;
      }
      final tokens = result as AuthTokens;
      state = AuthState(
        status: AuthStatus.authenticated,
        user: tokens.user,
      );
    } catch (e) {
      final lockSecs = _repo.lockRemainingSeconds(e);
      state = state.copyWith(
        loading: false,
        status: AuthStatus.unauthenticated,
        error: lockSecs != null
            ? 'Conta bloqueada. Tente novamente em ${_formatLock(lockSecs)}.'
            : _repo.mapError(e),
        lockRemainingSeconds: lockSecs,
      );
    }
  }

  String _formatLock(int seconds) {
    final m = (seconds / 60).ceil();
    return m <= 1 ? '1 minuto' : '$m minutos';
  }

  Future<void> verify2fa(String code) async {
    final challenge = state.pending2fa;
    if (challenge == null) return;
    state = state.copyWith(loading: true, clearError: true);
    try {
      final tokens = await _repo.verify2fa(challenge.challengeId, code);
      state = AuthState(
        status: AuthStatus.authenticated,
        user: tokens.user,
      );
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: _repo.mapError(e),
        pending2fa: challenge,
      );
    }
  }

  Future<void> register(String email, String password, String name) async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final tokens = await _repo.register(
        email: email,
        password: password,
        name: name,
      );
      state = AuthState(
        status: AuthStatus.authenticated,
        user: tokens.user,
      );
    } catch (e) {
      state = state.copyWith(
        loading: false,
        status: AuthStatus.unauthenticated,
        error: _repo.mapError(e),
      );
    }
  }

  Future<void> setBiometricEnabled(bool enabled) async {
    try {
      if (enabled) {
        final available = await _biometrics.isAvailable();
        if (!available) {
          state = state.copyWith(error: 'Biometria não disponível neste aparelho');
          return;
        }
        final ok = await _biometrics.authenticate(
          reason: 'Ative a biometria no FastSell',
          biometricOnly: true,
        );
        if (!ok) {
          state = state.copyWith(error: 'Não foi possível confirmar a biometria');
          return;
        }
      }
      final user = await _repo.updateBiometric(enabled);
      state = state.copyWith(user: user, clearError: true);
    } catch (e) {
      state = state.copyWith(error: _repo.mapError(e));
    }
  }

  Future<TwoFactorSetup> start2faSetup({
    required String method,
    String? phone,
  }) {
    return _repo.setup2fa(method: method, phone: phone);
  }

  Future<void> confirm2faSetup(String code) async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final user = await _repo.confirm2fa(code);
      state = state.copyWith(user: user, loading: false, clearError: true);
    } catch (e) {
      state = state.copyWith(loading: false, error: _repo.mapError(e));
      rethrow;
    }
  }

  Future<void> disable2fa() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final user = await _repo.disable2fa();
      state = state.copyWith(user: user, loading: false, clearError: true);
    } catch (e) {
      state = state.copyWith(loading: false, error: _repo.mapError(e));
    }
  }

  Future<void> updateProfile({
    String? name,
    String? phone,
    String? cpf,
  }) async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final user = await _repo.updateProfile(name: name, phone: phone, cpf: cpf);
      state = state.copyWith(user: user, loading: false, clearError: true);
    } catch (e) {
      state = state.copyWith(loading: false, error: _repo.mapError(e));
      rethrow;
    }
  }

  Future<void> uploadPhoto(String path) async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final user = await _repo.uploadPhoto(path);
      state = state.copyWith(user: user, loading: false, clearError: true);
    } catch (e) {
      state = state.copyWith(loading: false, error: _repo.mapError(e));
      rethrow;
    }
  }

  void setPendingResetToken(String token) {
    state = state.copyWith(pendingResetToken: token);
  }

  void clearPendingResetToken() {
    state = state.copyWith(clearResetToken: true);
  }

  Future<void> logout() async {
    await _repo.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void clearPending2fa() {
    state = state.copyWith(clearPending2fa: true, clearError: true);
  }

  void clearError() {
    state = state.copyWith(clearError: true, clearLock: true);
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
