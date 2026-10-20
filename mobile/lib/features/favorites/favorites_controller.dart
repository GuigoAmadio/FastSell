import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../auth/auth_controller.dart';
import '../catalog/catalog_models.dart';

class FavoritesRepository {
  FavoritesRepository(this._api);
  final ApiClient _api;

  Future<Set<String>> ids() async {
    final response = await _api.dio.get('/me/favorites/ids');
    final data = response.data as Map<String, dynamic>;
    return (data['productIds'] as List<dynamic>).cast<String>().toSet();
  }

  Future<List<ProductCard>> list() async {
    final response = await _api.dio.get('/me/favorites');
    final data = response.data as Map<String, dynamic>;
    return (data['items'] as List<dynamic>)
        .map((e) => ProductCard.fromJson(
              (e as Map<String, dynamic>)['product'] as Map<String, dynamic>,
            ))
        .toList();
  }

  Future<void> add(String productId) => _api.dio.put('/me/favorites/$productId');

  Future<void> remove(String productId) =>
      _api.dio.delete('/me/favorites/$productId');

  String mapError(Object e) => _api.extractError(e);
}

final favoritesRepositoryProvider = Provider((ref) {
  return FavoritesRepository(ref.watch(apiClientProvider));
});

/// US13 — conjunto de ids favoritados, compartilhado por todas as telas.
/// O coração muda na hora (otimista); se a API falhar, volta ao estado anterior.
class FavoritesController extends Notifier<Set<String>> {
  FavoritesRepository get _repo => ref.read(favoritesRepositoryProvider);

  @override
  Set<String> build() {
    // Recarrega quando o usuário entra/sai da conta.
    final status = ref.watch(authControllerProvider.select((s) => s.status));
    if (status == AuthStatus.authenticated) {
      Future.microtask(load);
    }
    return <String>{};
  }

  Future<void> load() async {
    try {
      state = await _repo.ids();
    } catch (_) {
      // sem rede: mantém o que já tinha
    }
  }

  bool isFavorite(String productId) => state.contains(productId);

  /// Retorna mensagem de erro (ou null) para a tela mostrar.
  Future<String?> toggle(String productId) async {
    final wasFavorite = state.contains(productId);
    state = wasFavorite
        ? ({...state}..remove(productId))
        : {...state, productId};
    try {
      if (wasFavorite) {
        await _repo.remove(productId);
      } else {
        await _repo.add(productId);
      }
      return null;
    } catch (e) {
      state = wasFavorite ? {...state, productId} : ({...state}..remove(productId));
      return _repo.mapError(e);
    }
  }
}

final favoritesControllerProvider =
    NotifierProvider<FavoritesController, Set<String>>(FavoritesController.new);
