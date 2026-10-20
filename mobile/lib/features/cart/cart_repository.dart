import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../auth/auth_controller.dart';
import 'cart_models.dart';

class CartRepository {
  CartRepository(this._api);
  final ApiClient _api;

  List<CartItem> _items(Response<dynamic> response) {
    final data = response.data as Map<String, dynamic>;
    return (data['items'] as List<dynamic>)
        .map((e) => CartItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<CartItem>> get() async => _items(await _api.dio.get('/me/cart'));

  Future<List<CartItem>> add(String variantId, int quantity) async => _items(
        await _api.dio.post(
          '/me/cart/items',
          data: {'variantId': variantId, 'quantity': quantity},
        ),
      );

  Future<List<CartItem>> setQuantity(String itemId, int quantity) async => _items(
        await _api.dio.patch('/me/cart/items/$itemId', data: {'quantity': quantity}),
      );

  Future<List<CartItem>> remove(String itemId) async =>
      _items(await _api.dio.delete('/me/cart/items/$itemId'));

  /// Valida estoque no servidor antes do checkout.
  Future<({bool ok, List<CartItem> items})> validate() async {
    final response = await _api.dio.post('/me/cart/validate');
    final data = response.data as Map<String, dynamic>;
    return (ok: data['ok'] as bool? ?? false, items: _items(response));
  }

  /// US15 — cotação para o CEP com os itens do carrinho.
  Future<List<ShippingOption>> quote(String cep) async {
    final response = await _api.dio.post(
      '/me/cart/shipping-quote',
      data: {'cep': cep},
    );
    final data = response.data as Map<String, dynamic>;
    return (data['options'] as List<dynamic>)
        .map((e) => ShippingOption.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Checkout mínimo: cria o pedido (sem pagamento nesta sprint).
  Future<String> checkout({String? shippingServiceId}) async {
    final response = await _api.dio.post(
      '/me/orders/checkout',
      data: {
        if (shippingServiceId != null) 'shippingServiceId': shippingServiceId,
      },
    );
    return (response.data as Map<String, dynamic>)['id'] as String;
  }

  ApiProblem problem(Object error) {
    if (error is DioException && error.response?.data is Map) {
      final data = error.response!.data as Map;
      return ApiProblem(
        message: _api.extractError(error),
        code: data['code'] as String?,
        available: data['available'] is int ? data['available'] as int : null,
      );
    }
    return ApiProblem(message: _api.extractError(error));
  }
}

final cartRepositoryProvider = Provider((ref) {
  return CartRepository(ref.watch(apiClientProvider));
});
