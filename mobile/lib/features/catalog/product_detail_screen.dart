import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/formatters.dart';
import '../cart/cart_controller.dart';
import '../reviews/review_form_screen.dart';
import 'catalog_models.dart';
import 'catalog_repository.dart';
import 'widgets/favorite_button.dart';
import 'widgets/product_gallery.dart';
import 'widgets/rating_stars.dart';

/// US11 — página do produto: galeria com zoom, preço, variações (cor/tamanho),
/// estoque atualizado periodicamente, ficha técnica e avaliações (US12).
class ProductDetailScreen extends ConsumerStatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  static const _stockRefresh = Duration(seconds: 15);

  ProductDetail? _product;
  List<Review> _reviews = [];
  ReviewEligibility? _eligibility;
  String? _error;
  bool _adding = false;
  String? _color;
  String? _size;
  Timer? _stockTimer;

  CatalogRepository get _repo => ref.read(catalogRepositoryProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _stockTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final product = await _repo.detail(widget.productId);
      if (!mounted) return;
      setState(() {
        _product = product;
        // Pré-seleciona a primeira opção com estoque.
        final firstAvailable = product.variants.where((v) => v.available).firstOrNull ??
            product.variants.firstOrNull;
        _color ??= firstAvailable?.color;
        _size ??= firstAvailable?.size;
      });
      _loadReviews();
      _stockTimer?.cancel();
      _stockTimer = Timer.periodic(_stockRefresh, (_) => _refreshStock());
    } catch (e) {
      if (mounted) setState(() => _error = _repo.mapError(e));
    }
  }

  Future<void> _loadReviews() async {
    try {
      final results = await Future.wait([
        _repo.reviews(widget.productId),
        _repo.eligibility(widget.productId).then<ReviewEligibility?>((e) => e).catchError(
              (_) => null,
            ),
      ]);
      if (!mounted) return;
      setState(() {
        _reviews = results[0] as List<Review>;
        _eligibility = results[1] as ReviewEligibility?;
      });
    } catch (_) {}
  }

  /// "Tempo real" por consulta periódica enquanto a tela está aberta.
  Future<void> _refreshStock() async {
    final product = _product;
    if (product == null) return;
    try {
      final stocks = await _repo.stock(product.id);
      if (mounted) setState(() => _product = product.withStocks(stocks));
    } catch (_) {}
  }

  ProductVariant? get _selected {
    final p = _product;
    if (p == null) return null;
    for (final v in p.variants) {
      if (v.color == _color && v.size == _size) return v;
    }
    return null;
  }

  bool _sizeAvailable(String size) {
    final p = _product!;
    return p.variants.any(
      (v) => v.size == size && (p.colors.isEmpty || v.color == _color) && v.available,
    );
  }

  /// [buyNow] = "Comprar agora": adiciona e já abre o carrinho.
  Future<void> _addToCart({bool buyNow = false}) async {
    final variant = _selected;
    if (variant == null) return;
    setState(() => _adding = true);
    final error = await ref.read(cartControllerProvider.notifier).add(variant.id, 1);
    if (!mounted) return;
    setState(() => _adding = false);
    if (error == null && buyNow) {
      Navigator.of(context).pushNamed('/cart');
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(error ?? 'Adicionado ao carrinho'),
        action: error == null
            ? SnackBarAction(
                label: 'Ver carrinho',
                onPressed: () => Navigator.of(context).pushNamed('/cart'),
              )
            : null,
      ),
    );
    if (error != null) _refreshStock();
  }

  Future<void> _openReviewForm() async {
    final p = _product!;
    final sent = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ReviewFormScreen(productId: p.id, productName: p.name),
      ),
    );
    if (sent == true) {
      final product = await _repo.detail(p.id);
      if (mounted) setState(() => _product = product);
      _loadReviews();
    }
  }

  /// A partir desta largura a página usa o layout de computador
  /// (foto grande à esquerda, compra à direita).
  static const _wideBreakpoint = 900.0;

  @override
  Widget build(BuildContext context) {
    final p = _product;
    if (p == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: _error == null
              ? const CircularProgressIndicator()
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!),
                    TextButton(onPressed: _load, child: const Text('Tentar de novo')),
                  ],
                ),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= _wideBreakpoint;
        return Scaffold(
          backgroundColor: wide ? const Color(0xFFEDEFF2) : null,
          appBar: AppBar(
            title: Text(wide ? p.category.name : p.brand.name),
            actions: [if (!wide) FavoriteButton(productId: p.id)],
          ),
          body: RefreshIndicator(
            onRefresh: _load,
            child: wide ? _wideLayout(p) : _narrowLayout(p),
          ),
          bottomNavigationBar: wide
              ? null
              : SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: _buyButton(p),
                  ),
                ),
        );
      },
    );
  }

  // ---------- celular: o layout em coluna de antes ----------

  Widget _narrowLayout(ProductDetail p) {
    return ListView(
      padding: const EdgeInsets.only(bottom: 120),
      children: [
        ProductGallery(images: p.images, heroPrefix: p.id),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ..._headline(p),
              const SizedBox(height: 16),
              ..._options(p),
              _StockLine(product: p, variant: _selected),
              const SizedBox(height: 24),
              ..._details(p),
            ],
          ),
        ),
      ],
    );
  }

  // ---------- computador: inspirado em grandes lojas ----------

  Widget _wideLayout(ProductDetail p) {
    final theme = Theme.of(context);
    final selected = _selected;

    final buyBox = Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFE3E6EA)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  p.brand.name,
                  style: theme.textTheme.labelLarge?.copyWith(color: const Color(0xFF3483FA)),
                ),
              ),
              FavoriteButton(productId: p.id),
            ],
          ),
          ..._headline(p, large: true),
          const SizedBox(height: 20),
          ..._options(p),
          _StockLine(product: p, variant: selected),
          if (selected != null && selected.available && selected.stock > 3)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${selected.stock} disponíveis',
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
              ),
            ),
          const SizedBox(height: 20),
          _buyButton(p, buyNow: true),
          const SizedBox(height: 10),
          _buyButton(p, secondary: true),
          const SizedBox(height: 16),
          Row(
            children: [
              const Icon(Icons.local_shipping_outlined, size: 18, color: Colors.black54),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Frete e prazo calculados pelo CEP no carrinho.',
                  style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                ),
              ),
            ],
          ),
          if (p.rating.count > 0) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.verified_outlined, size: 18, color: Colors.black54),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Avaliações só de quem comprou.',
                    style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );

    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
      children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1200),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 7,
                        child: DesktopProductGallery(images: p.images, heroPrefix: p.id),
                      ),
                      const SizedBox(width: 32),
                      Expanded(flex: 4, child: buyBox),
                    ],
                  ),
                  const Divider(height: 48),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 820),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: _details(p, large: true),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ---------- blocos compartilhados pelos dois layouts ----------

  List<Widget> _headline(ProductDetail p, {bool large = false}) {
    final theme = Theme.of(context);
    return [
      Text(
        p.name,
        style: theme.textTheme.headlineSmall?.copyWith(
          fontWeight: large ? FontWeight.w600 : null,
        ),
      ),
      const SizedBox(height: 6),
      if (p.rating.count > 0)
        Row(
          children: [
            RatingStars(value: p.rating.average),
            const SizedBox(width: 6),
            Text(
              '${p.rating.average.toStringAsFixed(1)} · ${p.rating.count} '
              '${p.rating.count == 1 ? 'avaliação' : 'avaliações'}',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      SizedBox(height: large ? 16 : 12),
      Text(
        formatBrl(p.priceCents),
        style: (large ? theme.textTheme.displaySmall : theme.textTheme.headlineSmall)
            ?.copyWith(fontWeight: large ? FontWeight.w400 : FontWeight.w700),
      ),
    ];
  }

  List<Widget> _options(ProductDetail p) {
    final theme = Theme.of(context);
    return [
      if (p.colors.isNotEmpty) ...[
        Text('Cor: ${_color ?? '—'}', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 10,
          children: [
            for (final c in p.colors)
              _ColorDot(
                option: c,
                selected: c.name == _color,
                onTap: () => setState(() {
                  _color = c.name;
                  if (_size != null && !_sizeAvailable(_size!)) {
                    final next = p.sizes.where(_sizeAvailable).firstOrNull;
                    if (next != null) _size = next;
                  }
                }),
              ),
          ],
        ),
        const SizedBox(height: 16),
      ],
      if (p.sizes.isNotEmpty) ...[
        Text('Tamanho', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final s in p.sizes)
              ChoiceChip(
                label: Text(s),
                selected: s == _size,
                onSelected: _sizeAvailable(s) ? (_) => setState(() => _size = s) : null,
              ),
          ],
        ),
        const SizedBox(height: 16),
      ],
    ];
  }

  List<Widget> _details(ProductDetail p, {bool large = false}) {
    final theme = Theme.of(context);
    final title = large ? theme.textTheme.titleLarge : theme.textTheme.titleMedium;
    return [
      if (p.specs.isNotEmpty) ...[
        Text(large ? 'Características do produto' : 'Ficha técnica', style: title),
        const SizedBox(height: 12),
        _SpecsTable(specs: p.specs, sku: _selected?.sku),
        const SizedBox(height: 32),
      ],
      if (p.description.isNotEmpty) ...[
        Text('Descrição', style: title),
        const SizedBox(height: 8),
        Text(
          p.description,
          style: (large ? theme.textTheme.bodyLarge : theme.textTheme.bodyMedium)
              ?.copyWith(height: 1.5, color: Colors.black87),
        ),
        const SizedBox(height: 32),
      ],
      _ReviewsSection(
        rating: p.rating,
        reviews: _reviews,
        eligibility: _eligibility,
        onWrite: _openReviewForm,
      ),
    ];
  }

  Widget _buyButton(ProductDetail p, {bool buyNow = false, bool secondary = false}) {
    final selected = _selected;
    final enabled = p.isActive && selected != null && selected.available && !_adding;
    final label = !p.isActive
        ? 'Produto indisponível'
        : selected == null
            ? 'Escolha as opções'
            : !selected.available
                ? 'Esgotado'
                : buyNow
                    ? 'Comprar agora'
                    : 'Adicionar ao carrinho';
    final child = _adding && !secondary
        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
        : Text(label);
    final onPressed = enabled ? () => _addToCart(buyNow: buyNow) : null;

    if (secondary) {
      return OutlinedButton(
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        onPressed: onPressed,
        child: child,
      );
    }
    return ElevatedButton(onPressed: onPressed, child: child);
  }
}

class _StockLine extends StatelessWidget {
  const _StockLine({required this.product, required this.variant});

  final ProductDetail product;
  final ProductVariant? variant;

  @override
  Widget build(BuildContext context) {
    late final Color color;
    late final String text;
    final stock = variant?.stock ?? product.totalStock;
    if (!product.isActive) {
      color = Colors.black54;
      text = 'Produto indisponível';
    } else if (stock <= 0) {
      color = const Color(0xFFB3261E);
      text = variant == null ? 'Esgotado' : 'Esgotado nesta opção';
    } else if (stock <= 3) {
      color = const Color(0xFFB26A00);
      text = 'Últimas $stock ${stock == 1 ? 'unidade' : 'unidades'}';
    } else {
      color = const Color(0xFF1E7B45);
      text = 'Em estoque';
    }
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _ColorDot extends StatelessWidget {
  const _ColorDot({required this.option, required this.selected, required this.onTap});

  final ColorOption option;
  final bool selected;
  final VoidCallback onTap;

  Color _parse(String? hex) {
    if (hex == null || hex.length != 7) return Colors.grey;
    return Color(int.parse('FF${hex.substring(1)}', radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: option.name,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: selected ? Colors.black87 : Colors.black12,
              width: selected ? 2 : 1,
            ),
          ),
          child: CircleAvatar(radius: 14, backgroundColor: _parse(option.hex)),
        ),
      ),
    );
  }
}

class _SpecsTable extends StatelessWidget {
  const _SpecsTable({required this.specs, this.sku});

  final List<ProductSpec> specs;
  final String? sku;

  @override
  Widget build(BuildContext context) {
    final rows = [
      ...specs.map((s) => (s.label, s.value)),
      if (sku != null) ('Código (SKU)', sku!),
    ];
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.black12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            Container(
              color: i.isEven ? const Color(0xFFF6F8FA) : Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 130,
                    child: Text(rows[i].$1, style: const TextStyle(color: Colors.black54)),
                  ),
                  Expanded(child: Text(rows[i].$2)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ReviewsSection extends StatelessWidget {
  const _ReviewsSection({
    required this.rating,
    required this.reviews,
    required this.eligibility,
    required this.onWrite,
  });

  final RatingSummary rating;
  final List<Review> reviews;
  final ReviewEligibility? eligibility;
  final VoidCallback onWrite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('Avaliações', style: theme.textTheme.titleMedium),
            const Spacer(),
            if (eligibility?.canReview == true)
              TextButton.icon(
                onPressed: onWrite,
                icon: const Icon(Icons.rate_review_outlined, size: 18),
                label: const Text('Avaliar'),
              ),
          ],
        ),
        if (rating.count == 0)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'Ainda sem avaliações. Só quem comprou o produto pode avaliar.',
              style: TextStyle(color: Colors.black54),
            ),
          )
        else ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                rating.average.toStringAsFixed(1),
                style: theme.textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  children: [
                    for (final stars in [5, 4, 3, 2, 1])
                      Row(
                        children: [
                          SizedBox(width: 14, child: Text('$stars')),
                          const Icon(Icons.star_rounded, size: 14, color: starColor),
                          const SizedBox(width: 6),
                          Expanded(
                            child: LinearProgressIndicator(
                              value: rating.count == 0
                                  ? 0
                                  : (rating.distribution[stars] ?? 0) / rating.count,
                              minHeight: 6,
                              borderRadius: BorderRadius.circular(3),
                              backgroundColor: const Color(0xFFEDEFF2),
                              color: starColor,
                            ),
                          ),
                          SizedBox(
                            width: 28,
                            child: Text(
                              '${rating.distribution[stars] ?? 0}',
                              textAlign: TextAlign.right,
                              style: theme.textTheme.bodySmall,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final r in reviews) _ReviewTile(review: r),
        ],
      ],
    );
  }
}

class _ReviewTile extends StatelessWidget {
  const _ReviewTile({required this.review});
  final Review review;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              RatingStars(value: review.rating.toDouble(), size: 14),
              const SizedBox(width: 8),
              Text(review.authorName, style: theme.textTheme.labelLarge),
              const Spacer(),
              Text(formatDate(review.createdAt), style: theme.textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            'Compra verificada',
            style: theme.textTheme.labelSmall?.copyWith(color: const Color(0xFF1E7B45)),
          ),
          if (review.comment != null) ...[
            const SizedBox(height: 6),
            Text(review.comment!),
          ],
          if (review.photoUrls.isNotEmpty) ...[
            const SizedBox(height: 8),
            SizedBox(
              height: 72,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: review.photoUrls.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) => ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    mediaUrl(review.photoUrls[i])!,
                    width: 72,
                    height: 72,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const SizedBox(width: 72),
                  ),
                ),
              ),
            ),
          ],
          const Divider(height: 24),
        ],
      ),
    );
  }
}
