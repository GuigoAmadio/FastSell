import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';
import 'cart_models.dart';
import 'cart_repository.dart';

class CartState {
  const CartState({
    this.items = const [],
    this.loading = false,
    this.error,
    this.alerts = const {},
  });

  final List<CartItem> items;
  final bool loading;
  final String? error;

  /// Alertas por item (ex.: "Só restam 2 em estoque").
  final Map<String, String> alerts;

  int get itemsCount => items.fold(0, (s, i) => s + i.quantity);

  /// Total recalculado localmente a cada mudança (US14).
  int get subtotalCents => items.fold(0, (s, i) => s + i.subtotalCents);

  bool get hasIssues => items.any((i) => i.issue != null || i.exceedsStock);

  CartState copyWith({
    List<CartItem>? items,
    bool? loading,
    String? error,
    bool clearError = false,
    Map<String, String>? alerts,
  }) {
    return CartState(
      items: items ?? this.items,
      loading: loading ?? this.loading,
      error: clearError ? null : (error ?? this.error),
      alerts: alerts ?? this.alerts,
    );
  }
}

/// US14 — estado do carrinho no app. Mudanças de quantidade aparecem na hora
/// (subtotal e total recalculados localmente); a API confirma em seguida e,
/// se recusar (estoque), o item volta ao valor válido com um alerta visual.
class CartController extends Notifier<CartState> {
  CartRepository get _repo => ref.read(cartRepositoryProvider);

  /// Evita respostas fora de ordem quando o usuário toca rápido no +/−.
  final Map<String, int> _requestSeq = {};

  @override
  CartState build() {
    final status = ref.watch(authControllerProvider.select((s) => s.status));
    if (status == AuthStatus.authenticated) {
      Future.microtask(load);
    }
    return const CartState();
  }

  Future<void> load() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final items = await _repo.get();
      state = CartState(items: items, alerts: _alertsFromIssues(items));
    } catch (e) {
      state = state.copyWith(loading: false, error: _repo.problem(e).message);
    }
  }

  Map<String, String> _alertsFromIssues(List<CartItem> items) {
    return {
      for (final i in items)
        if (i.issue == 'UNAVAILABLE')
          i.id: 'Produto indisponível. Remova para continuar.'
        else if (i.issue == 'OUT_OF_STOCK')
          i.id: 'Sem estoque no momento.'
        else if (i.issue == 'INSUFFICIENT_STOCK')
          i.id: 'Só restam ${i.availableStock} em estoque. Ajuste a quantidade.',
    };
  }

  /// Retorna mensagem de erro para a tela (ou null).
  Future<String?> add(String variantId, int quantity) async {
    try {
      final items = await _repo.add(variantId, quantity);
      state = CartState(items: items, alerts: _alertsFromIssues(items));
      return null;
    } catch (e) {
      return _repo.problem(e).message;
    }
  }

  Future<void> setQuantity(CartItem item, int quantity) async {
    if (quantity < 1) return;
    final alerts = Map<String, String>.from(state.alerts);

    // Alerta visual imediato quando passa do estoque conhecido (US14).
    if (quantity > item.availableStock) {
      alerts[item.id] = item.availableStock > 0
          ? 'Só restam ${item.availableStock} em estoque.'
          : 'Sem estoque no momento.';
      state = state.copyWith(alerts: alerts);
      return;
    }

    final previous = item.quantity;
    alerts.remove(item.id);
    state = state.copyWith(
      items: [
        for (final i in state.items) i.id == item.id ? i.copyWith(quantity: quantity) : i,
      ],
      alerts: alerts,
    );

    final seq = (_requestSeq[item.id] ?? 0) + 1;
    _requestSeq[item.id] = seq;
    try {
      final items = await _repo.setQuantity(item.id, quantity);
      if (_requestSeq[item.id] != seq) return; // chegou uma resposta mais nova
      state = state.copyWith(items: items, alerts: {
        ...state.alerts,
        ..._alertsFromIssues(items),
      });
    } catch (e) {
      if (_requestSeq[item.id] != seq) return;
      final problem = _repo.problem(e);
      final available = problem.available;
      final reverted = [
        for (final i in state.items)
          i.id == item.id
              ? i.copyWith(
                  quantity: previous,
                  availableStock: available ?? i.availableStock,
                )
              : i,
      ];
      state = state.copyWith(
        items: reverted,
        alerts: {...state.alerts, item.id: problem.message},
      );
    }
  }

  Future<void> remove(CartItem item) async {
    final before = state.items;
    state = state.copyWith(
      items: [for (final i in before) if (i.id != item.id) i],
      alerts: Map<String, String>.from(state.alerts)..remove(item.id),
    );
    try {
      final items = await _repo.remove(item.id);
      state = state.copyWith(items: items);
    } catch (e) {
      state = state.copyWith(items: before, error: _repo.problem(e).message);
    }
  }

  /// Validação de estoque no servidor antes do checkout.
  Future<bool> validate() async {
    try {
      final result = await _repo.validate();
      state = CartState(items: result.items, alerts: _alertsFromIssues(result.items));
      return result.ok;
    } catch (e) {
      state = state.copyWith(error: _repo.problem(e).message);
      return false;
    }
  }

  void clearLocal() {
    state = const CartState();
  }
}

final cartControllerProvider =
    NotifierProvider<CartController, CartState>(CartController.new);
