import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fastsell_mobile/app.dart';

void main() {
  testWidgets('App sobe com ProviderScope', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: FastSellApp()));
    expect(find.text('FastSell'), findsWidgets);
  });
}
