import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../catalog/catalog_models.dart';
import '../catalog/widgets/product_tile.dart';
import 'favorites_controller.dart';

/// US13 — página dedicada da lista de desejos. Tocar no item abre os detalhes;
/// desfavoritar (aqui ou na página do produto) tira o item da lista na hora.
class FavoritesScreen extends ConsumerStatefulWidget {
  const FavoritesScreen({super.key});

  @override
  ConsumerState<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends ConsumerState<FavoritesScreen> {
  List<ProductCard>? _items;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(favoritesRepositoryProvider);
    try {
      final items = await repo.list();
      if (mounted) {
        setState(() {
          _items = items;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = repo.mapError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final ids = ref.watch(favoritesControllerProvider);
    // Mostra só o que ainda está favoritado (o coração atualiza o conjunto na hora).
    final visible = _items?.where((p) => ids.contains(p.id)).toList();

    // Favoritou algo em outra tela: recarrega para trazer o cartão completo.
    ref.listen(favoritesControllerProvider, (prev, next) {
      final known = _items?.map((p) => p.id).toSet() ?? <String>{};
      if (next.any((id) => !known.contains(id))) _load();
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Favoritos')),
      body: visible == null
          ? Center(
              child: _error != null
                  ? Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!),
                        TextButton(onPressed: _load, child: const Text('Tentar de novo')),
                      ],
                    )
                  : const CircularProgressIndicator(),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: visible.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 120),
                        Icon(Icons.favorite_border, size: 44, color: Colors.black38),
                        SizedBox(height: 12),
                        Text(
                          'Toque no coração de um produto para guardá-lo aqui.',
                          textAlign: TextAlign.center,
                        ),
                      ],
                    )
                  : GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 220,
                        mainAxisSpacing: 20,
                        crossAxisSpacing: 14,
                        childAspectRatio: 0.58,
                      ),
                      itemCount: visible.length,
                      itemBuilder: (_, i) => ProductTile(product: visible[i], onReturn: _load),
                    ),
            ),
    );
  }
}
