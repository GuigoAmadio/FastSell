// Modelos do catálogo (US31). O mesmo `id` de produto é usado pela busca,
// pela página de detalhes, pelos favoritos e pelo carrinho.

class NamedRef {
  NamedRef({required this.id, required this.name});

  final String id;
  final String name;

  factory NamedRef.fromJson(Map<String, dynamic> json) =>
      NamedRef(id: json['id'] as String, name: json['name'] as String);
}

class ProductCard {
  ProductCard({
    required this.id,
    required this.slug,
    required this.name,
    required this.priceCents,
    required this.imageUrl,
    required this.brand,
    required this.category,
    required this.ratingAvg,
    required this.ratingCount,
    required this.inStock,
    required this.isActive,
  });

  final String id;
  final String slug;
  final String name;
  final int priceCents;
  final String? imageUrl;
  final NamedRef brand;
  final NamedRef category;
  final double ratingAvg;
  final int ratingCount;
  final bool inStock;
  final bool isActive;

  factory ProductCard.fromJson(Map<String, dynamic> json) => ProductCard(
        id: json['id'] as String,
        slug: json['slug'] as String,
        name: json['name'] as String,
        priceCents: json['priceCents'] as int,
        imageUrl: json['imageUrl'] as String?,
        brand: NamedRef.fromJson(json['brand'] as Map<String, dynamic>),
        category: NamedRef.fromJson(json['category'] as Map<String, dynamic>),
        ratingAvg: (json['ratingAvg'] as num? ?? 0).toDouble(),
        ratingCount: json['ratingCount'] as int? ?? 0,
        inStock: json['inStock'] as bool? ?? false,
        isActive: json['isActive'] as bool? ?? true,
      );
}

class SearchPage {
  SearchPage({
    required this.items,
    required this.page,
    required this.totalPages,
    required this.total,
  });

  final List<ProductCard> items;
  final int page;
  final int totalPages;
  final int total;

  factory SearchPage.fromJson(Map<String, dynamic> json) => SearchPage(
        items: (json['items'] as List<dynamic>)
            .map((e) => ProductCard.fromJson(e as Map<String, dynamic>))
            .toList(),
        page: json['page'] as int,
        totalPages: json['totalPages'] as int,
        total: json['total'] as int,
      );
}

enum SortOption {
  relevance('relevance', 'Relevância'),
  priceAsc('price_asc', 'Menor preço'),
  priceDesc('price_desc', 'Maior preço');

  const SortOption(this.apiValue, this.label);
  final String apiValue;
  final String label;
}

/// Filtros da busca (US10). Todos combináveis.
class SearchFilters {
  const SearchFilters({
    this.query = '',
    this.categoryIds = const {},
    this.brandIds = const {},
    this.minPriceCents,
    this.maxPriceCents,
    this.inStockOnly = false,
    this.sort = SortOption.relevance,
  });

  final String query;
  final Set<String> categoryIds;
  final Set<String> brandIds;
  final int? minPriceCents;
  final int? maxPriceCents;
  final bool inStockOnly;
  final SortOption sort;

  int get activeFilterCount =>
      (categoryIds.isNotEmpty ? 1 : 0) +
      (brandIds.isNotEmpty ? 1 : 0) +
      (minPriceCents != null || maxPriceCents != null ? 1 : 0) +
      (inStockOnly ? 1 : 0);

  SearchFilters copyWith({
    String? query,
    Set<String>? categoryIds,
    Set<String>? brandIds,
    int? minPriceCents,
    int? maxPriceCents,
    bool clearPrice = false,
    bool? inStockOnly,
    SortOption? sort,
  }) {
    return SearchFilters(
      query: query ?? this.query,
      categoryIds: categoryIds ?? this.categoryIds,
      brandIds: brandIds ?? this.brandIds,
      minPriceCents: clearPrice ? null : (minPriceCents ?? this.minPriceCents),
      maxPriceCents: clearPrice ? null : (maxPriceCents ?? this.maxPriceCents),
      inStockOnly: inStockOnly ?? this.inStockOnly,
      sort: sort ?? this.sort,
    );
  }

  Map<String, dynamic> toQuery(int page) => {
        if (query.trim().isNotEmpty) 'q': query.trim(),
        if (categoryIds.isNotEmpty) 'categoryIds': categoryIds.join(','),
        if (brandIds.isNotEmpty) 'brandIds': brandIds.join(','),
        if (minPriceCents != null) 'minPrice': minPriceCents,
        if (maxPriceCents != null) 'maxPrice': maxPriceCents,
        if (inStockOnly) 'inStock': true,
        'sort': sort.apiValue,
        'page': page,
        'pageSize': 20,
      };
}

class ProductImage {
  ProductImage({required this.url, required this.alt});
  final String url;
  final String alt;
}

class ProductSpec {
  ProductSpec({required this.label, required this.value});
  final String label;
  final String value;
}

class ProductVariant {
  ProductVariant({
    required this.id,
    required this.sku,
    required this.color,
    required this.colorHex,
    required this.size,
    required this.label,
    required this.stock,
  });

  final String id;
  final String sku;
  final String? color;
  final String? colorHex;
  final String? size;
  final String? label;
  final int stock;

  bool get available => stock > 0;

  ProductVariant withStock(int value) => ProductVariant(
        id: id,
        sku: sku,
        color: color,
        colorHex: colorHex,
        size: size,
        label: label,
        stock: value,
      );

  factory ProductVariant.fromJson(Map<String, dynamic> json) => ProductVariant(
        id: json['id'] as String,
        sku: json['sku'] as String,
        color: json['color'] as String?,
        colorHex: json['colorHex'] as String?,
        size: json['size'] as String?,
        label: json['label'] as String?,
        stock: json['stock'] as int? ?? 0,
      );
}

class ColorOption {
  ColorOption({required this.name, required this.hex});
  final String name;
  final String? hex;
}

class RatingSummary {
  RatingSummary({
    required this.average,
    required this.count,
    required this.distribution,
  });

  final double average;
  final int count;

  /// estrelas -> quantidade
  final Map<int, int> distribution;

  factory RatingSummary.fromJson(Map<String, dynamic> json) => RatingSummary(
        average: (json['average'] as num? ?? 0).toDouble(),
        count: json['count'] as int? ?? 0,
        distribution: {
          for (final d in (json['distribution'] as List<dynamic>? ?? const []))
            (d as Map<String, dynamic>)['stars'] as int: d['count'] as int,
        },
      );
}

class ProductDetail {
  ProductDetail({
    required this.id,
    required this.name,
    required this.description,
    required this.priceCents,
    required this.brand,
    required this.category,
    required this.specs,
    required this.images,
    required this.isActive,
    required this.variants,
    required this.colors,
    required this.sizes,
    required this.rating,
  });

  final String id;
  final String name;
  final String description;
  final int priceCents;
  final NamedRef brand;
  final NamedRef category;
  final List<ProductSpec> specs;
  final List<ProductImage> images;
  final bool isActive;
  final List<ProductVariant> variants;
  final List<ColorOption> colors;
  final List<String> sizes;
  final RatingSummary rating;

  int get totalStock => variants.fold(0, (sum, v) => sum + v.stock);

  ProductDetail withStocks(Map<String, int> stockByVariant) => ProductDetail(
        id: id,
        name: name,
        description: description,
        priceCents: priceCents,
        brand: brand,
        category: category,
        specs: specs,
        images: images,
        isActive: isActive,
        variants: [
          for (final v in variants) v.withStock(stockByVariant[v.id] ?? v.stock),
        ],
        colors: colors,
        sizes: sizes,
        rating: rating,
      );

  factory ProductDetail.fromJson(Map<String, dynamic> json) => ProductDetail(
        id: json['id'] as String,
        name: json['name'] as String,
        description: json['description'] as String? ?? '',
        priceCents: json['priceCents'] as int,
        brand: NamedRef.fromJson(json['brand'] as Map<String, dynamic>),
        category: NamedRef.fromJson(json['category'] as Map<String, dynamic>),
        specs: [
          for (final s in (json['specs'] as List<dynamic>? ?? const []))
            ProductSpec(
              label: (s as Map<String, dynamic>)['label'] as String,
              value: s['value'] as String,
            ),
        ],
        images: [
          for (final i in (json['images'] as List<dynamic>? ?? const []))
            ProductImage(
              url: (i as Map<String, dynamic>)['url'] as String,
              alt: i['alt'] as String? ?? '',
            ),
        ],
        isActive: json['isActive'] as bool? ?? true,
        variants: [
          for (final v in (json['variants'] as List<dynamic>? ?? const []))
            ProductVariant.fromJson(v as Map<String, dynamic>),
        ],
        colors: [
          for (final c in (json['colors'] as List<dynamic>? ?? const []))
            ColorOption(
              name: (c as Map<String, dynamic>)['name'] as String,
              hex: c['hex'] as String?,
            ),
        ],
        sizes: [
          for (final s in (json['sizes'] as List<dynamic>? ?? const [])) s as String,
        ],
        rating: RatingSummary.fromJson(
          json['rating'] as Map<String, dynamic>? ?? const {},
        ),
      );
}

class Review {
  Review({
    required this.id,
    required this.rating,
    required this.comment,
    required this.authorName,
    required this.createdAt,
    required this.photoUrls,
  });

  final String id;
  final int rating;
  final String? comment;
  final String authorName;
  final DateTime createdAt;
  final List<String> photoUrls;

  factory Review.fromJson(Map<String, dynamic> json) => Review(
        id: json['id'] as String,
        rating: json['rating'] as int,
        comment: json['comment'] as String?,
        authorName: json['authorName'] as String? ?? 'Cliente',
        createdAt: DateTime.parse(json['createdAt'] as String),
        photoUrls: [
          for (final p in (json['photos'] as List<dynamic>? ?? const []))
            (p as Map<String, dynamic>)['url'] as String,
        ],
      );
}

class ReviewEligibility {
  ReviewEligibility({required this.canReview, required this.reason});
  final bool canReview;
  final String? reason;
}
