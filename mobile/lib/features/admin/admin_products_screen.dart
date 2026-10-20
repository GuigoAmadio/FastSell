import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/formatters.dart';
import 'admin_product_form_screen.dart';
import 'admin_repository.dart';

/// US31 — painel administrativo: lista de produtos (inclui desativados).
class AdminProductsScreen extends ConsumerStatefulWidget {
  const AdminProductsScreen({super.key});

  @override
  ConsumerState<AdminProductsScreen> createState() => _AdminProductsScreenState();
}

class _AdminProductsScreenState extends ConsumerState<AdminProductsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _status = 'all';
  List<AdminProductRow>? _items;
  int _total = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final repo = ref.read(adminRepositoryProvider);
    try {
      final result = await repo.list(query: _search.text, status: _status);
      if (!mounted) return;
      setState(() {
        _items = result.items;
        _total = result.total;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = repo.mapError(e));
    }
  }

  Future<void> _open({String? productId}) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AdminProductFormScreen(productId: productId),
      ),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = _items;

    return Scaffold(
      appBar: AppBar(title: const Text('Painel administrativo')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _open(),
        icon: const Icon(Icons.add),
        label: const Text('Novo produto'),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 960),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: TextField(
                  controller: _search,
                  decoration: const InputDecoration(
                    hintText: 'Buscar por nome, marca ou categoria',
                    prefixIcon: Icon(Icons.search),
                    isDense: true,
                  ),
                  onChanged: (_) {
                    _debounce?.cancel();
                    _debounce = Timer(const Duration(milliseconds: 350), _load);
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    for (final (value, label) in const [
                      ('all', 'Todos'),
                      ('active', 'Ativos'),
                      ('inactive', 'Desativados'),
                    ])
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(label),
                          selected: _status == value,
                          onSelected: (_) {
                            setState(() => _status = value);
                            _load();
                          },
                        ),
                      ),
                    const Spacer(),
                    Text('$_total produtos', style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: items == null
                    ? Center(
                        child: _error != null
                            ? Text(_error!)
                            : const CircularProgressIndicator(),
                      )
                    : items.isEmpty
                        ? const Center(child: Text('Nenhum produto encontrado.'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.only(bottom: 96),
                              itemCount: items.length,
                              separatorBuilder: (_, __) => const Divider(height: 1),
                              itemBuilder: (_, i) => _ProductRow(
                                row: items[i],
                                onTap: () => _open(productId: items[i].id),
                              ),
                            ),
                          ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow({required this.row, required this.onTap});

  final AdminProductRow row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final image = mediaUrl(row.imageUrl);
    final lowStock = row.isActive && row.totalStock <= 3;

    return ListTile(
      onTap: onTap,
      leading: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 52,
          height: 52,
          color: const Color(0xFFEEF1F5),
          child: image == null
              ? const Icon(Icons.image_outlined, color: Colors.black26)
              : Image.network(
                  image,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
        ),
      ),
      title: Text(
        row.name,
        style: row.isActive ? null : const TextStyle(color: Colors.black45),
      ),
      subtitle: Text(
        '${row.brand} · ${row.category} · ${row.variantsCount} '
        '${row.variantsCount == 1 ? 'variação' : 'variações'}',
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(formatBrl(row.priceCents), style: theme.textTheme.titleSmall),
          const SizedBox(height: 2),
          Text(
            !row.isActive
                ? 'Desativado'
                : row.totalStock == 0
                    ? 'Sem estoque'
                    : '${row.totalStock} em estoque',
            style: theme.textTheme.bodySmall?.copyWith(
              color: !row.isActive
                  ? Colors.black45
                  : lowStock
                      ? const Color(0xFFB26A00)
                      : const Color(0xFF1E7B45),
            ),
          ),
        ],
      ),
    );
  }
}
