import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/image_upload.dart';
import '../../core/api_client.dart';
import '../../core/secure_storage.dart';
import 'models.dart';

class AuthRepository {
  AuthRepository(this._api, this._storage);

  final ApiClient _api;
  final SecureStorageService _storage;

  Future<Object> login(String email, String password) async {
    final response = await _api.dio.post(
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    final data = response.data as Map<String, dynamic>;
    if (data['requires2fa'] == true) {
      return TwoFactorChallenge.fromJson(data);
    }
    final tokens = AuthTokens.fromJson(data);
    await _persistSession(tokens);
    return tokens;
  }

  Future<AuthTokens> verify2fa(String challengeId, String code) async {
    final response = await _api.dio.post(
      '/auth/2fa/verify',
      data: {'challengeId': challengeId, 'code': code},
    );
    final tokens = AuthTokens.fromJson(response.data as Map<String, dynamic>);
    await _persistSession(tokens);
    return tokens;
  }

  Future<TwoFactorSetup> setup2fa({
    required String method,
    String? phone,
  }) async {
    final response = await _api.dio.post(
      '/auth/2fa/setup',
      data: {
        'method': method,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
      },
    );
    return TwoFactorSetup.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AuthUser> confirm2fa(String code) async {
    final response = await _api.dio.post(
      '/auth/2fa/confirm',
      data: {'code': code},
    );
    return AuthUser.fromJson(
      (response.data as Map<String, dynamic>)['user'] as Map<String, dynamic>,
    );
  }

  Future<AuthUser> disable2fa() async {
    final response = await _api.dio.post('/auth/2fa/disable');
    return AuthUser.fromJson(
      (response.data as Map<String, dynamic>)['user'] as Map<String, dynamic>,
    );
  }

  Future<AuthTokens> register({
    required String email,
    required String password,
    String? name,
  }) async {
    final response = await _api.dio.post(
      '/auth/register',
      data: {
        'email': email,
        'password': password,
        if (name != null && name.isNotEmpty) 'name': name,
      },
    );
    final tokens = AuthTokens.fromJson(response.data as Map<String, dynamic>);
    await _persistSession(tokens);
    return tokens;
  }

  Future<AuthTokens> refreshWithStoredToken() async {
    final refresh = await _storage.getRefreshToken();
    if (refresh == null) {
      throw StateError('Sem refresh token');
    }
    final response = await _api.dio.post(
      '/auth/refresh',
      data: {'refreshToken': refresh},
    );
    final tokens = AuthTokens.fromJson(response.data as Map<String, dynamic>);
    await _persistSession(tokens);
    return tokens;
  }

  Future<void> forgotPassword(String email) async {
    await _api.dio.post('/auth/forgot-password', data: {'email': email});
  }

  Future<void> resetPassword(String token, String password) async {
    await _api.dio.post(
      '/auth/reset-password',
      data: {'token': token, 'password': password},
    );
  }

  Future<AuthUser> me() async {
    final response = await _api.dio.get('/me');
    return AuthUser.fromJson(
      (response.data as Map<String, dynamic>)['user'] as Map<String, dynamic>,
    );
  }

  Future<AuthUser> updateProfile({
    String? name,
    String? phone,
    String? cpf,
  }) async {
    final response = await _api.dio.patch(
      '/me',
      data: {
        if (name != null) 'name': name,
        if (phone != null) 'phone': phone,
        if (cpf != null) 'cpf': cpf,
      },
    );
    return AuthUser.fromJson(
      (response.data as Map<String, dynamic>)['user'] as Map<String, dynamic>,
    );
  }

  Future<AuthUser> uploadPhoto(XFile file) async {
    final form = FormData.fromMap({
      'photo': await imageMultipart(file),
    });
    final response = await _api.dio.post('/me/photo', data: form);
    return AuthUser.fromJson(
      (response.data as Map<String, dynamic>)['user'] as Map<String, dynamic>,
    );
  }

  Future<AuthUser> updateBiometric(bool enabled) async {
    final response = await _api.dio.patch(
      '/me/settings',
      data: {'biometricEnabled': enabled},
    );
    await _storage.setBiometricEnabled(enabled);
    return AuthUser.fromJson(
      (response.data as Map<String, dynamic>)['user'] as Map<String, dynamic>,
    );
  }

  Future<List<SessionInfo>> listSessions() async {
    final refresh = await _storage.getRefreshToken();
    final response = await _api.dio.get(
      '/me/sessions',
      options: Options(
        headers: {
          if (refresh != null) 'x-refresh-token': refresh,
        },
      ),
    );
    // A API responde { sessions: [...] }; aceita também lista pura.
    final data = response.data;
    final list = data is Map
        ? (data['sessions'] as List<dynamic>? ?? const [])
        : (data as List<dynamic>? ?? const []);
    return list
        .map((e) => SessionInfo.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> revokeSession(String id) async {
    await _api.dio.delete('/me/sessions/$id');
  }

  Future<void> revokeAllSessions() async {
    final refresh = await _storage.getRefreshToken();
    await _api.dio.delete(
      '/me/sessions',
      data: {
        if (refresh != null) 'currentRefreshToken': refresh,
      },
      options: Options(
        headers: {
          if (refresh != null) 'x-refresh-token': refresh,
        },
      ),
    );
  }

  Future<List<Address>> listAddresses() async {
    final response = await _api.dio.get('/me/addresses');
    final list = response.data as List<dynamic>? ?? const [];
    return list
        .map((e) => Address.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Address> createAddress(Map<String, dynamic> data) async {
    final response = await _api.dio.post('/me/addresses', data: data);
    return Address.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Address> updateAddress(String id, Map<String, dynamic> data) async {
    final response = await _api.dio.put('/me/addresses/$id', data: data);
    return Address.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteAddress(String id) async {
    await _api.dio.delete('/me/addresses/$id');
  }

  Future<Address> setDefaultAddress(String id) async {
    final response = await _api.dio.post('/me/addresses/$id/default');
    return Address.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> logout() async {
    final refresh = await _storage.getRefreshToken();
    if (refresh != null) {
      try {
        await _api.dio.post('/auth/logout', data: {'refreshToken': refresh});
      } catch (_) {}
    }
    await _storage.clearTokens();
  }

  Future<void> _persistSession(AuthTokens tokens) async {
    await _storage.saveTokens(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    );
    await _storage.saveEmail(tokens.user.email);
    await _storage.setBiometricEnabled(tokens.user.biometricEnabled);
  }

  String mapError(Object error) => _api.extractError(error);

  int? lockRemainingSeconds(Object error) {
    if (error is! DioException) return null;
    final data = error.response?.data;
    if (data is Map) {
      if (data['lockRemainingSeconds'] is int) {
        return data['lockRemainingSeconds'] as int;
      }
      final message = data['message'];
      if (message is Map && message['lockRemainingSeconds'] is int) {
        return message['lockRemainingSeconds'] as int;
      }
    }
    return null;
  }

  bool isLockedOut(Object error) {
    return error is DioException && error.response?.statusCode == 403;
  }
}
