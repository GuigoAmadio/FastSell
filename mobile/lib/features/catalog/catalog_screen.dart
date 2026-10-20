import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/formatters.dart';
import 'catalog_models.dart';
import 'catalog_repository.dart';
import 'widgets/product_tile.dart';

/// US10 — vitrine com busca por nome, filtros combinados, ordenação e
/// paginação (rolagem infinita). Os dados vêm da API real (/products).
class CatalogScreen extends ConsumerStatefulWidget {
  const CatalogScreen({super.key});

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
  final _searchCtrl = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;

  SearchFilters _filters = const SearchFilters();
  final List<ProductCard> _items = [];
  int _page = 0;
  int _totalPages = 1;
  int _total = 0;
  bool _loading = false;
  String? _error;
  int _requestId = 0;

  List<NamedRef> _categories = [];
  List<NamedRef> _brands = [];

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _loadFacets();
    _reload();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadFacets() async {
    try {
      final repo = ref.read(catalogRepositoryProvider);
      final results = await Future.wait([repo.categories(), repo.brands()]);
      if (!mounted) return;
      setState(() {
        _categories = results[0];
        _brands = results[1];
      });
    } catch (_) {
      // filtros por categoria/marca ficam indisponíveis, busca continua
    }
  }

  void _onScroll() {
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400 &&
        !_loading &&
        _page < _totalPages) {
      _loadPage(_page + 1);
    }
  }

  Future<void> _reload() async {
    _items.clear();
    _page = 0;
    _totalPages = 1;
    await _loadPage(1);
  }

  Future<void> _loadPage(int page) async {
    final requestId = ++_requestId;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result =
          await ref.read(catalogRepositoryProvider).search(_filters, page: page);
      if (!mounted || requestId != _requestId) return;
      setState(() {
        if (page == 1) _items.clear();
        _items.addAll(result.items);
        _page = result.page;
        _totalPages = result.totalPages;
        _total = result.total;
      });
    } catch (e) {
      if (!mounted || requestId != _requestId) return;
      setState(() => _error = ref.read(catalogRepositoryProvider).mapError(e));
    } finally {
      if (mounted && requestId == _requestId) setState(() => _loading = false);
    }
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _filters = _filters.copyWith(query: value);
      _reload();
    });
  }

  Future<void> _openFilters() async {
    final result = await showModalBottomSheet<SearchFilters>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FilterSheet(
        initial: _filters,
        categories: _categories,
        brands: _brands,
      ),
    );
    if (result != null) {
      setState(() => _filters = result);
      _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final filterCount = _filters.activeFilterCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('FastSell'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(64),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _searchCtrl,
              onChanged: _onQueryChanged,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Buscar produtos',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                suffixIcon: _searchCtrl.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _searchCtrl.clear();
                          _onQueryChanged('');
                          setState(() {});
                        },
                      ),
              ),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: CustomScrollView(
          controller: _scroll,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _loading && _items.isEmpty
                            ? 'Buscando…'
                            : '$_total ${_total == 1 ? 'produto' : 'produtos'}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                    PopupMenuButton<SortOption>(
                      initialValue: _filters.sort,
                      onSelected: (s) {
                        setState(() => _filters = _filters.copyWith(sort: s));
                        _reload();
                      },
                      itemBuilder: (_) => [
                        for (final s in SortOption.values)
                          PopupMenuItem(value: s, child: Text(s.label)),
                      ],
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Row(
                          children: [
                            const Icon(Icons.swap_vert, size: 18),
                            const SizedBox(width: 4),
                            Text(_filters.sort.label),
                          ],
                        ),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _openFilters,
                      icon: const Icon(Icons.tune, size: 18),
                      label: Text(filterCount > 0 ? 'Filtros ($filterCount)' : 'Filtros'),
                    ),
                  ],
                ),
              ),
            ),
            if (_error != null && _items.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _Message(
                  icon: Icons.cloud_off,
                  text: _error!,
                  action: TextButton(onPressed: _reload, child: const Text('Tentar de novo')),
                ),
              )
            else if (!_loading && _items.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: _Message(
                  icon: Icons.search_off,
                  text: 'Nenhum produto encontrado com esses filtros.',
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 220,
                    mainAxisSpacing: 20,
                    crossAxisSpacing: 14,
                    childAspectRatio: 0.58,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (_, i) => ProductTile(product: _items[i]),
                    childCount: _items.length,
                  ),
                ),
              ),
            if (_loading && _items.isNotEmpty)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
            if (_loading && _items.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: CircularProgressIndicator()),
              ),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text, this.action});

  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 40, color: Colors.black38),
          const SizedBox(height: 12),
          Text(text, textAlign: TextAlign.center),
          if (action != null) action!,
        ],
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({
    required this.initial,
    required this.categories,
    required this.brands,
  });

  final SearchFilters initial;
  final List<NamedRef> categories;
  final List<NamedRef> brands;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late Set<String> _categories = {...widget.initial.categoryIds};
  late Set<String> _brands = {...widget.initial.brandIds};
  late bool _inStock = widget.initial.inStockOnly;
  late final _min = TextEditingController(
    text: widget.initial.minPriceCents == null
        ? ''
        : (widget.initial.minPriceCents! ~/ 100).toString(),
  );
  late final _max = TextEditingController(
    text: widget.initial.maxPriceCents == null
        ? ''
        : (widget.initial.maxPriceCents! ~/ 100).toString(),
  );
  String? _priceError;

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  void _apply() {
    final min = _min.text.trim().isEmpty ? null : parseBrlToCents(_min.text);
    final max = _max.text.trim().isEmpty ? null : parseBrlToCents(_max.text);
    if ((_min.text.trim().isNotEmpty && min == null) ||
        (_max.text.trim().isNotEmpty && max == null)) {
      setState(() => _priceError = 'Informe valores numéricos');
      return;
    }
    if (min != null && max != null && min > max) {
      setState(() => _priceError = 'O mínimo não pode ser maior que o máximo');
      return;
    }
    Navigator.pop(
      context,
      SearchFilters(
        query: widget.initial.query,
        sort: widget.initial.sort,
        categoryIds: _categories,
        brandIds: _brands,
        minPriceCents: min,
        maxPriceCents: max,
        inStockOnly: _inStock,
      ),
    );
  }

  Widget _chips(List<NamedRef> options, Set<String> selected, ValueChanged<Set<String>> onChanged) {
    if (options.isEmpty) {
      return const Text('Indisponível no momento', style: TextStyle(color: Colors.black45));
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          FilterChip(
            label: Text(o.name),
            selected: selected.contains(o.id),
            onSelected: (on) {
              final next = {...selected};
              on ? next.add(o.id) : next.remove(o.id);
              onChanged(next);
            },
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final titleStyle = Theme.of(context).textTheme.titleSmall;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('Filtros', style: Theme.of(context).textTheme.titleLarge),
                const Spacer(),
                TextButton(
                  onPressed: () => setState(() {
                    _categories = {};
                    _brands = {};
                    _inStock = false;
                    _min.clear();
                    _max.clear();
                    _priceError = null;
                  }),
                  child: const Text('Limpar'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('Categoria', style: titleStyle),
            const SizedBox(height: 8),
            _chips(widget.categories, _categories, (v) => setState(() => _categories = v)),
            const SizedBox(height: 20),
            Text('Marca', style: titleStyle),
            const SizedBox(height: 8),
            _chips(widget.brands, _brands, (v) => setState(() => _brands = v)),
            const SizedBox(height: 20),
            Text('Preço (R\$)', style: titleStyle),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _min,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Mínimo', isDense: true),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _max,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Máximo', isDense: true),
                  ),
                ),
              ],
            ),
            if (_priceError != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(_priceError!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Somente com estoque'),
              value: _inStock,
              onChanged: (v) => setState(() => _inStock = v),
            ),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: _apply, child: const Text('Ver resultados')),
          ],
        ),
      ),
    );
  }
}
