// Mesmas regras do backend (api/src/common/validators.ts).
// A validação real acontece na API; aqui é para o usuário ver o erro na hora.

String onlyDigits(String value) => value.replaceAll(RegExp(r'\D'), '');

/// CPF com dígitos verificadores (módulo 11). Aceita com ou sem máscara.
bool isValidCpf(String raw) {
  final trimmed = raw.trim();
  final plain = RegExp(r'^\d{11}$');
  final masked = RegExp(r'^\d{3}\.\d{3}\.\d{3}-\d{2}$');
  if (!plain.hasMatch(trimmed) && !masked.hasMatch(trimmed)) return false;
  final cpf = onlyDigits(trimmed);
  if (RegExp(r'^(\d)\1{10}$').hasMatch(cpf)) return false;

  int digit(int len) {
    var sum = 0;
    for (var i = 0; i < len; i++) {
      sum += int.parse(cpf[i]) * (len + 1 - i);
    }
    final rest = (sum * 10) % 11;
    return rest == 10 ? 0 : rest;
  }

  return digit(9) == int.parse(cpf[9]) && digit(10) == int.parse(cpf[10]);
}

/// Máscara visual 000.000.000-00 (não valida nada sozinha).
String formatCpf(String raw) {
  final d = onlyDigits(raw);
  final s = d.length > 11 ? d.substring(0, 11) : d;
  if (s.length <= 3) return s;
  if (s.length <= 6) return '${s.substring(0, 3)}.${s.substring(3)}';
  if (s.length <= 9) {
    return '${s.substring(0, 3)}.${s.substring(3, 6)}.${s.substring(6)}';
  }
  return '${s.substring(0, 3)}.${s.substring(3, 6)}.${s.substring(6, 9)}-${s.substring(9)}';
}

/// Telefone BR: DDD 11–99 + 8 dígitos (fixo) ou 9 começando com 9 (celular).
bool isValidBrPhone(String raw) {
  var d = onlyDigits(raw);
  if ((d.length == 12 || d.length == 13) && d.startsWith('55')) {
    d = d.substring(2);
  }
  if (d.length != 10 && d.length != 11) return false;
  if (d[0] == '0' || d[1] == '0') return false;
  if (d.length == 11 && d[2] != '9') return false;
  return true;
}

/// Máscara visual (00) 00000-0000 / (00) 0000-0000.
String formatPhone(String raw) {
  var d = onlyDigits(raw);
  if ((d.length == 12 || d.length == 13) && d.startsWith('55')) {
    d = d.substring(2);
  }
  if (d.length > 11) d = d.substring(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return '(${d.substring(0, 2)}) ${d.substring(2)}';
  if (d.length <= 10) {
    return '(${d.substring(0, 2)}) ${d.substring(2, 6)}-${d.substring(6)}';
  }
  return '(${d.substring(0, 2)}) ${d.substring(2, 7)}-${d.substring(7)}';
}

/// Senha forte (US03): 8+ caracteres, ao menos uma letra, um número e um símbolo.
/// Retorna a mensagem de erro ou null.
String? strongPasswordError(String? value) {
  if (value == null || value.length < 8) return 'Mínimo 8 caracteres';
  if (value.length > 128) return 'Máximo 128 caracteres';
  if (!RegExp(r'\p{L}', unicode: true).hasMatch(value)) {
    return 'Inclua pelo menos uma letra';
  }
  if (!RegExp(r'\p{N}', unicode: true).hasMatch(value)) {
    return 'Inclua pelo menos um número';
  }
  if (!RegExp(r'[^\p{L}\p{N}]', unicode: true).hasMatch(value)) {
    return 'Inclua pelo menos um símbolo';
  }
  return null;
}

/// CEP: 8 dígitos (aceita 00000-000).
bool isValidCep(String raw) {
  final d = onlyDigits(raw);
  return d.length == 8 && d != '00000000';
}

String formatCep(String raw) {
  final d = onlyDigits(raw);
  final s = d.length > 8 ? d.substring(0, 8) : d;
  if (s.length <= 5) return s;
  return '${s.substring(0, 5)}-${s.substring(5)}';
}
