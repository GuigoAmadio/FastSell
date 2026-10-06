import 'package:flutter/foundation.dart';

class ApiConfig {
  // Android emulator: 10.0.2.2
  // Web / Windows / iOS simulator: 127.0.0.1
  // Device físico: --dart-define=API_BASE_URL=http://SEU_IP:3000
  static String get baseUrl {
    const fromEnv = String.fromEnvironment('API_BASE_URL');
    if (fromEnv.isNotEmpty) return fromEnv;

    if (kIsWeb) return 'http://127.0.0.1:3000';
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return 'http://10.0.2.2:3000';
      default:
        return 'http://127.0.0.1:3000';
    }
  }
}
