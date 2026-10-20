import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/image_upload.dart';
import '../../core/api_client.dart';
import '../auth/auth_controller.dart';
import 'catalog_models.dart';

class CatalogRepository {
  CatalogRepository(this._api);

  final ApiClient _api;

  Future<SearchPage> search(SearchFilters filters, {int page = 1}) async {
    final response = await _api.dio.get(
      '/products',
      queryParameters: filters.toQuery(page),
    );
    return SearchPage.fromJson(response.data as Map<String, dynamic>);
  }

  Future<List<NamedRef>> categories() => _named('/categories');

  Future<List<NamedRef>> brands() => _named('/brands');

  Future<List<NamedRef>> _named(String path) async {
    final response = await _api.dio.get(path);
    return (response.data as List<dynamic>)
        .map((e) => NamedRef.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ProductDetail> detail(String productId) async {
    final response = await _api.dio.get('/products/$productId');
    return ProductDetail.fromJson(response.data as Map<String, dynamic>);
  }

  /// US11 — estoque atual por variação (consultado periodicamente na tela).
  Future<Map<String, int>> stock(String productId) async {
    final response = await _api.dio.get('/products/$productId/stock');
    final data = response.data as Map<String, dynamic>;
    return {
      for (final v in (data['variants'] as List<dynamic>))
        (v as Map<String, dynamic>)['id'] as String: v['stock'] as int,
    };
  }

  Future<List<Review>> reviews(String productId, {int page = 1}) async {
    final response = await _api.dio.get(
      '/products/$productId/reviews',
      queryParameters: {'page': page, 'pageSize': 10},
    );
    final data = response.data as Map<String, dynamic>;
    return (data['items'] as List<dynamic>)
        .map((e) => Review.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ReviewEligibility> eligibility(String productId) async {
    final response = await _api.dio.get('/products/$productId/reviews/eligibility');
    final data = response.data as Map<String, dynamic>;
    return ReviewEligibility(
      canReview: data['canReview'] as bool? ?? false,
      reason: data['reason'] as String?,
    );
  }

  /// US12 — envia nota, comentário e até 3 fotos (multipart).
  Future<void> createReview({
    required String productId,
    required int rating,
    String? comment,
    List<XFile> photos = const [],
  }) async {
    final form = FormData();
    form.fields.add(MapEntry('rating', rating.toString()));
    if (comment != null && comment.trim().isNotEmpty) {
      form.fields.add(MapEntry('comment', comment.trim()));
    }
    for (final photo in photos) {
      form.files.add(MapEntry('photos', await imageMultipart(photo)));
    }
    await _api.dio.post('/products/$productId/reviews', data: form);
  }

  String mapError(Object error) => _api.extractError(error);
}

final catalogRepositoryProvider = Provider((ref) {
  return CatalogRepository(ref.watch(apiClientProvider));
});
