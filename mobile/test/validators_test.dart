import 'package:fastsell_mobile/core/formatters.dart';
import 'package:fastsell_mobile/core/validators.dart';
import 'package:fastsell_mobile/features/cart/cart_controller.dart';
import 'package:fastsell_mobile/features/cart/cart_models.dart';
import 'package:flutter_test/flutter_test.dart';

CartItem _item(String id, int price, int qty, {int stock = 10}) => CartItem(
      id: id,
      variantId: 'v$id',
      productId: 'p$id',
      productName: 'Produto $id',
      variantLabel: null,
      imageUrl: null,
      unitPriceCents: price,
      quantity: qty,
      availableStock: stock,
      maxQuantity: stock,
      issue: null,
    );

void main() {
  group('CPF (US06)', () {
    test('aceita válidos com e sem máscara', () {
      expect(isValidCpf('52998224725'), isTrue);
      expect(isValidCpf('529.982.247-25'), isTrue);
    });

    test('rejeita dígito verificador errado, repetidos e lixo', () {
      expect(isValidCpf('52998224724'), isFalse);
      expect(isValidCpf('111.111.111-11'), isFalse);
      expect(isValidCpf('5299822472a'), isFalse);
      expect(isValidCpf(''), isFalse);
    });

    test('máscara visual', () {
      expect(formatCpf('52998224725'), '529.982.247-25');
      expect(formatCpf('5299'), '529.9');
    });
  });

  group('Telefone (US06)', () {
    test('valida DDD e celular', () {
      expect(isValidBrPhone('(11) 98765-4321'), isTrue);
      expect(isValidBrPhone('1932321234'), isTrue);
      expect(isValidBrPhone('(01) 98765-4321'), isFalse);
      expect(isValidBrPhone('(11) 88765-4321'), isFalse);
    });

    test('máscara visual', () {
      expect(formatPhone('11987654321'), '(11) 98765-4321');
      expect(formatPhone('1932321234'), '(19) 3232-1234');
    });
  });

  group('Senha forte (US03) igual à API', () {
    test('regras', () {
      expect(strongPasswordError('Senha@123'), isNull);
      expect(strongPasswordError('SENHA#123'), isNull);
      expect(strongPasswordError('Ab@1'), isNotNull);
      expect(strongPasswordError('Senhaaaa@'), isNotNull);
      expect(strongPasswordError('Senha1234'), isNotNull);
      expect(strongPasswordError('12345678!'), isNotNull);
    });
  });

  group('Formatação', () {
    test('moeda', () {
      expect(formatBrl(12990), r'R$ 129,90');
      expect(formatBrl(123456), r'R$ 1.234,56');
      expect(formatBrl(5), r'R$ 0,05');
      expect(parseBrlToCents('129,90'), 12990);
      expect(parseBrlToCents('abc'), isNull);
      expect(parseBrlToCents('199.90'), 19990);
      expect(parseBrlToCents('1.299,90'), 129990);
      expect(parseBrlToCents('1.299'), 129900);
      expect(parseBrlToCents('R\$ 49'), 4900);
    });

    test('CEP', () {
      expect(isValidCep('13010-000'), isTrue);
      expect(isValidCep('00000-000'), isFalse);
      expect(formatCep('13010000'), '13010-000');
    });
  });

  group('Carrinho (US14) — cálculo local', () {
    test('subtotal por item e total', () {
      final state = CartState(items: [_item('1', 2590, 2), _item('2', 10000, 1)]);
      expect(state.items.first.subtotalCents, 5180);
      expect(state.subtotalCents, 15180);
      expect(state.itemsCount, 3);
    });

    test('quantidade acima do estoque marca problema', () {
      final state = CartState(items: [_item('1', 1000, 4, stock: 3)]);
      expect(state.items.first.exceedsStock, isTrue);
      expect(state.hasIssues, isTrue);
    });
  });
}
