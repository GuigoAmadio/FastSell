import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageService {
  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';
  static const _biometricKey = 'biometric_enabled';
  static const _emailKey = 'saved_email';

  final Map<String, String> _memory = {};
  final FlutterSecureStorage? _storage;

  SecureStorageService()
      : _storage = kIsWeb
            ? null
            : const FlutterSecureStorage(
                aOptions: AndroidOptions(
                  resetOnError: true,
                  migrateOnAlgorithmChange: true,
                ),
                iOptions: IOSOptions(
                  accessibility: KeychainAccessibility.first_unlock,
                ),
              );

  Future<String?> _read(String key) async {
    if (_storage == null) return _memory[key];
    try {
      return await _storage.read(key: key).timeout(const Duration(seconds: 3));
    } catch (_) {
      try {
        await _storage.deleteAll();
      } catch (_) {}
      return null;
    }
  }

  Future<void> _write(String key, String value) async {
    if (_storage == null) {
      _memory[key] = value;
      return;
    }
    await _storage.write(key: key, value: value);
  }

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _write(_accessKey, accessToken);
    await _write(_refreshKey, refreshToken);
  }

  Future<String?> getAccessToken() => _read(_accessKey);

  Future<String?> getRefreshToken() => _read(_refreshKey);

  Future<void> clearTokens() async {
    if (_storage == null) {
      _memory.remove(_accessKey);
      _memory.remove(_refreshKey);
      return;
    }
    try {
      await _storage.delete(key: _accessKey);
      await _storage.delete(key: _refreshKey);
    } catch (_) {}
  }

  Future<void> setBiometricEnabled(bool enabled) async {
    await _write(_biometricKey, enabled ? '1' : '0');
  }

  Future<bool> isBiometricEnabled() async {
    final value = await _read(_biometricKey);
    return value == '1';
  }

  Future<void> saveEmail(String email) async {
    await _write(_emailKey, email);
  }

  Future<String?> getSavedEmail() => _read(_emailKey);

  Future<void> clearAll() async {
    if (_storage == null) {
      _memory.clear();
      return;
    }
    try {
      await _storage.deleteAll();
    } catch (_) {}
  }
}
