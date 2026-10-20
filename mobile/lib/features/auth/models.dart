class AuthUser {
  final String id;
  final String email;
  final String? name;
  final String? phone;
  final String? cpf;
  final String? photoUrl;
  final bool biometricEnabled;
  final bool twoFactorEnabled;
  final String? twoFactorMethod;

  /// CUSTOMER ou ADMIN (US31: painel administrativo só para ADMIN).
  final String role;

  bool get isAdmin => role == 'ADMIN';

  AuthUser({
    required this.id,
    required this.email,
    this.name,
    this.phone,
    this.cpf,
    this.photoUrl,
    required this.biometricEnabled,
    required this.twoFactorEnabled,
    this.twoFactorMethod,
    this.role = 'CUSTOMER',
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      email: json['email'] as String,
      name: json['name'] as String?,
      phone: json['phone'] as String?,
      cpf: json['cpf'] as String?,
      photoUrl: json['photoUrl'] as String?,
      biometricEnabled: json['biometricEnabled'] as bool? ?? false,
      twoFactorEnabled: json['twoFactorEnabled'] as bool? ?? false,
      twoFactorMethod: json['twoFactorMethod'] as String?,
      role: json['role'] as String? ?? 'CUSTOMER',
    );
  }

  AuthUser copyWith({
    String? name,
    String? phone,
    String? cpf,
    String? photoUrl,
    bool? biometricEnabled,
    bool? twoFactorEnabled,
    String? twoFactorMethod,
  }) {
    return AuthUser(
      id: id,
      email: email,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      cpf: cpf ?? this.cpf,
      photoUrl: photoUrl ?? this.photoUrl,
      biometricEnabled: biometricEnabled ?? this.biometricEnabled,
      twoFactorEnabled: twoFactorEnabled ?? this.twoFactorEnabled,
      twoFactorMethod: twoFactorMethod ?? this.twoFactorMethod,
      role: role,
    );
  }
}

class AuthTokens {
  final String accessToken;
  final String refreshToken;
  final AuthUser user;

  AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

class TwoFactorChallenge {
  final String challengeId;
  final String? method;
  final int expiresInSeconds;

  TwoFactorChallenge({
    required this.challengeId,
    required this.method,
    required this.expiresInSeconds,
  });

  factory TwoFactorChallenge.fromJson(Map<String, dynamic> json) {
    return TwoFactorChallenge(
      challengeId: json['challengeId'] as String,
      method: json['method'] as String?,
      expiresInSeconds: json['expiresInSeconds'] as int? ?? 300,
    );
  }
}

class TwoFactorSetup {
  final String method;
  final String? setupId;
  final String? secret;
  final String? otpauthUrl;
  final String? qrCodeDataUrl;
  final int expiresInSeconds;

  TwoFactorSetup({
    required this.method,
    this.setupId,
    this.secret,
    this.otpauthUrl,
    this.qrCodeDataUrl,
    required this.expiresInSeconds,
  });

  factory TwoFactorSetup.fromJson(Map<String, dynamic> json) {
    return TwoFactorSetup(
      method: json['method'] as String,
      setupId: json['setupId'] as String?,
      secret: json['secret'] as String?,
      otpauthUrl: json['otpauthUrl'] as String?,
      qrCodeDataUrl: json['qrCodeDataUrl'] as String?,
      expiresInSeconds: json['expiresInSeconds'] as int? ?? 300,
    );
  }
}

class SessionInfo {
  final String id;
  final String? ip;
  final String? userAgent;
  final String? deviceLabel;
  final DateTime createdAt;
  final DateTime? lastUsedAt;
  final bool isCurrent;

  SessionInfo({
    required this.id,
    this.ip,
    this.userAgent,
    this.deviceLabel,
    required this.createdAt,
    this.lastUsedAt,
    required this.isCurrent,
  });

  factory SessionInfo.fromJson(Map<String, dynamic> json) {
    return SessionInfo(
      id: json['id'] as String,
      ip: json['ip'] as String?,
      userAgent: json['userAgent'] as String?,
      deviceLabel: json['deviceLabel'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastUsedAt: json['lastUsedAt'] != null
          ? DateTime.parse(json['lastUsedAt'] as String)
          : null,
      isCurrent: json['isCurrent'] as bool? ?? false,
    );
  }
}

class Address {
  final String id;
  final String? label;
  final String cep;
  final String street;
  final String number;
  final String? complement;
  final String neighborhood;
  final String city;
  final String state;
  final bool isDefault;

  Address({
    required this.id,
    this.label,
    required this.cep,
    required this.street,
    required this.number,
    this.complement,
    required this.neighborhood,
    required this.city,
    required this.state,
    required this.isDefault,
  });

  factory Address.fromJson(Map<String, dynamic> json) {
    return Address(
      id: json['id'] as String,
      label: json['label'] as String?,
      cep: json['cep'] as String,
      street: json['street'] as String,
      number: json['number'] as String,
      complement: json['complement'] as String?,
      neighborhood: json['neighborhood'] as String,
      city: json['city'] as String,
      state: json['state'] as String,
      isDefault: json['isDefault'] as bool? ?? false,
    );
  }

  String get summary =>
      '$street, $number — $neighborhood, $city/$state · CEP $cep';
}
