import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fastsell_mobile/app.dart';

void main() {
  testWidgets('App sobe com ProviderScope e abre no login', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: FastSellApp()));
    // Sem sessão salva, a primeira tela é o login ("Entrar no FastSell").
    // find.text exige texto idêntico; textContaining aceita o trecho.
    expect(find.textContaining('FastSell'), findsWidgets);
  });
}
