import 'package:flutter/services.dart';

/// Formatter genérico: aplica uma função de máscara e mantém o cursor no fim.
/// Usado para CPF, telefone e CEP (US06/US15). É só visual: quem valida é o
/// validador do campo e, de verdade, a API.
class MaskFormatter extends TextInputFormatter {
  MaskFormatter(this.mask);

  final String Function(String) mask;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final formatted = mask(newValue.text);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
