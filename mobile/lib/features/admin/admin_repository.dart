import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api_client.dart';
import '../../core/image_upload.dart';
import '../auth/auth_controller.dart';
import '../catalog/catalog_models.dart';

/// US31 — modelos e chamadas do painel administrativo (rotas /admin/*, só ADMIN).

class AdminProductRow {
  AdminProductRow({
    required this.id,
    required this.name,
    required this.priceCents,
    required this.isActive,
    required this.brand,
    required this.category,
    required this.imageUrl,
    required this.variantsCount,
    required this.totalStock,
  });

  final String id;
  final String name;
  final int priceCents;
  final bool isActive;
  final String brand;
  final String category;
  final String? imageUrl;
  final int variantsCount;
  final int totalStock;

  factory AdminProductRow.fromJson(Map<String, dynamic> j) => AdminProductRow(
        id: j['id'] as String,
        name: j['name'] as String,
        priceCents: j['priceCents'] as int,
        isActive: j['isActive'] as bool? ?? true,
        brand: (j['brand'] as Map<String, dynamic>)['name'] as String,
        category: (j['category'] as Map<String, dynamic>)['name'] as String,
        imageUrl: j['imageUrl'] as String?,
        variantsCount: j['variantsCount'] as int? ?? 0,
        totalStock: j['totalStock'] as int? ?? 0,
      );
}

class AdminVariant {
  AdminVariant({
    required this.id,
    required this.sku,
    required this.color,
    required this.colorHex,
    required this.size,
    required this.stock,
    required this.isActive,
  });

  final String id;
  final String sku;
  final String? color;
  final String? colorHex;
  final String? size;
  final int stock;
  final bool isActive;

  String get label {
    final parts = [
      if (color != null && color!.isNotEmpty) color!,
      if (size != null && size!.isNotEmpty) 'Tam. $size',
    ];
    return parts.isEmpty ? 'Variação única' : parts.join(' · ');
  }

  factory AdminVariant.fromJson(Map<String, dynamic> j) => AdminVariant(
        id: j['id'] as String,
        sku: j['sku'] as String,
        color: j['color'] as String?,
        colorHex: j['colorHex'] as String?,
        size: j['size'] as String?,
        stock: j['stock'] as int? ?? 0,
        isActive: j['isActive'] as bool? ?? true,
      );
}

class AdminImage {
  AdminImage({required this.id, required this.url});
  final String id;
  final String url;
}

class AdminProduct {
  AdminProduct({
    required this.id,
    required this.name,
    required this.description,
    required this.priceCents,
    required this.categoryId,
    required this.brandId,
    required this.specs,
    required this.weightGrams,
    required this.heightCm,
    required this.widthCm,
    required this.lengthCm,
    required this.isActive,
    required this.variants,
    required this.images,
  });

  final String id;
  final String name;
  final String description;
  final int priceCents;
  final String categoryId;
  final String brandId;
  final List<ProductSpec> specs;
  final int weightGrams;
  final int heightCm;
  final int widthCm;
  final int lengthCm;
  final bool isActive;
  final List<AdminVariant> variants;
  final List<AdminImage> images;

  factory AdminProduct.fromJson(Map<String, dynamic> j) => AdminProduct(
        id: j['id'] as String,
        name: j['name'] as String,
        description: j['description'] as String? ?? '',
        priceCents: j['priceCents'] as int,
        categoryId: j['categoryId'] as String,
        brandId: j['brandId'] as String,
        specs: [
          for (final s in (j['specs'] as List<dynamic>? ?? const []))
            ProductSpec(
              label: (s as Map<String, dynamic>)['label'] as String,
              value: s['value'] as String,
            ),
        ],
        weightGrams: j['weightGrams'] as int? ?? 500,
        heightCm: j['heightCm'] as int? ?? 10,
        widthCm: j['widthCm'] as int? ?? 15,
        lengthCm: j['lengthCm'] as int? ?? 20,
        isActive: j['isActive'] as bool? ?? true,
        variants: [
          for (final v in (j['variants'] as List<dynamic>? ?? const []))
            AdminVariant.fromJson(v as Map<String, dynamic>),
        ],
        images: [
          for (final i in (j['images'] as List<dynamic>? ?? const []))
            AdminImage(
              id: (i as Map<String, dynamic>)['id'] as String,
              url: i['url'] as String,
            ),
        ],
      );
}

/// Dados de uma variação nova (antes de existir no banco).
class VariantDraft {
  VariantDraft({
    required this.sku,
    this.color,
    this.colorHex,
    this.size,
    required this.stock,
  });

  String sku;
  String? color;
  String? colorHex;
  String? size;
  int stock;

  Map<String, dynamic> toJson() => {
        'sku': sku,
        if (color != null && color!.trim().isNotEmpty) 'color': color!.trim(),
        if (colorHex != null && colorHex!.isNotEmpty) 'colorHex': colorHex,
        if (size != null && size!.trim().isNotEmpty) 'size': size!.trim(),
        'stock': stock,
      };
}

class AdminRepository {
  AdminRepository(this._api);
  final ApiClient _api;

  Future<({List<AdminProductRow> items, int total})> list({
    String query = '',
    String status = 'all',
    int page = 1,
  }) async {
    final response = await _api.dio.get(
      '/admin/products',
      queryParameters: {
        if (query.trim().isNotEmpty) 'q': query.trim(),
        'status': status,
        'page': page,
        'pageSize': 30,
      },
    );
    final data = response.data as Map<String, dynamic>;
    return (
      items: (data['items'] as List<dynamic>)
          .map((e) => AdminProductRow.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: data['total'] as int,
    );
  }

  Future<AdminProduct> get(String id) async {
    final response = await _api.dio.get('/admin/products/$id');
    return AdminProduct.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AdminProduct> create(Map<String, dynamic> data) async {
    final response = await _api.dio.post('/admin/products', data: data);
    return AdminProduct.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AdminProduct> update(String id, Map<String, dynamic> data) async {
    final response = await _api.dio.patch('/admin/products/$id', data: data);
    return AdminProduct.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deactivate(String id) => _api.dio.delete('/admin/products/$id');

  Future<void> addVariant(String productId, VariantDraft draft) =>
      _api.dio.post('/admin/products/$productId/variants', data: draft.toJson());

  Future<void> updateVariant(String variantId, Map<String, dynamic> data) =>
      _api.dio.patch('/admin/variants/$variantId', data: data);

  Future<void> uploadImage(String productId, XFile file) async {
    final form = FormData.fromMap({'image': await imageMultipart(file)});
    await _api.dio.post('/admin/products/$productId/images', data: form);
  }

  Future<void> removeImage(String productId, String imageId) =>
      _api.dio.delete('/admin/products/$productId/images/$imageId');

  Future<NamedRef> createCategory(String name) => _named('/admin/categories', name);

  Future<NamedRef> createBrand(String name) => _named('/admin/brands', name);

  Future<NamedRef> _named(String path, String name) async {
    final response = await _api.dio.post(path, data: {'name': name.trim()});
    return NamedRef.fromJson(response.data as Map<String, dynamic>);
  }

  String mapError(Object e) => _api.extractError(e);
}

final adminRepositoryProvider = Provider((ref) {
  return AdminRepository(ref.watch(apiClientProvider));
});

/// Sugestão de SKU no formato aceito pela API: [A-Z0-9-], 3 a 40 caracteres.
String suggestSku(String productName, String? color, String? size) {
  String clean(String v) {
    const from = 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
    const to = 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN';
    final buffer = StringBuffer();
    for (final ch in v.split('')) {
      final i = from.indexOf(ch);
      buffer.write(i >= 0 ? to[i] : ch);
    }
    return buffer.toString().toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]+'), ' ').trim();
  }

  final words = clean(productName).split(' ').where((w) => w.isNotEmpty);
  final initials = words.map((w) => w[0]).join();
  final base = initials.length >= 2 ? initials : clean(productName).replaceAll(' ', '');
  final c = color == null || color.trim().isEmpty
      ? 'UN'
      : clean(color).replaceAll(' ', '');
  final s = size == null || size.trim().isEmpty ? 'U' : clean(size).replaceAll(' ', '');
  final sku = [
    base.length > 8 ? base.substring(0, 8) : base,
    c.length > 4 ? c.substring(0, 4) : c,
    s.length > 6 ? s.substring(0, 6) : s,
  ].where((p) => p.isNotEmpty).join('-');
  return sku.length < 3 ? '${sku}XX' : sku;
}
