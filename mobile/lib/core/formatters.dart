import 'config.dart';

/// 12990 -> "R$ 129,90"; 123456 -> "R$ 1.234,56".
String formatBrl(int cents) {
  final negative = cents < 0;
  final abs = cents.abs();
  final reais = (abs ~/ 100).toString();
  final centavos = (abs % 100).toString().padLeft(2, '0');
  final buffer = StringBuffer();
  for (var i = 0; i < reais.length; i++) {
    final fromEnd = reais.length - i;
    buffer.write(reais[i]);
    if (fromEnd > 1 && fromEnd % 3 == 1) buffer.write('.');
  }
  return '${negative ? '-' : ''}R\$ ${buffer.toString()},$centavos';
}

/// "R\$ 1.299,90" / "1299,90" / "1299.90" / "129" -> centavos. null se não for número.
/// Com vírgula, o ponto é separador de milhar; sem vírgula, um ponto seguido
/// de 1 ou 2 dígitos é a casa decimal (quem digita 199.90 quer R\$ 199,90).
int? parseBrlToCents(String input) {
  var cleaned = input.replaceAll(RegExp(r'[^\d,\.]'), '');
  if (cleaned.isEmpty) return null;
  if (cleaned.contains(',')) {
    cleaned = cleaned.replaceAll('.', '').replaceAll(',', '.');
  } else if (!RegExp(r'^\d+\.\d{1,2}$').hasMatch(cleaned)) {
    cleaned = cleaned.replaceAll('.', '');
  }
  final value = double.tryParse(cleaned);
  if (value == null) return null;
  return (value * 100).round();
}

/// URLs de mídia da API chegam relativas ("/uploads/...").
String? mediaUrl(String? path) {
  if (path == null || path.isEmpty) return null;
  if (path.startsWith('http')) return path;
  return '${ApiConfig.baseUrl}$path';
}

String formatDate(DateTime date) {
  final d = date.toLocal();
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}/${d.year}';
}
