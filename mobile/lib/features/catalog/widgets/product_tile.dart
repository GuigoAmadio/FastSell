import 'package:flutter/material.dart';
import '../../../core/formatters.dart';
import '../catalog_models.dart';
import 'favorite_button.dart';
import 'rating_stars.dart';

/// Cartão de produto da vitrine/busca/favoritos. Toque abre a página do produto.
class ProductTile extends StatelessWidget {
  const ProductTile({super.key, required this.product, this.onReturn});

  final ProductCard product;

  /// Chamado ao voltar da página de detalhes (ex.: recarregar lista).
  final VoidCallback? onReturn;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final image = mediaUrl(product.imageUrl);
    final unavailable = !product.isActive || !product.inStock;

    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () async {
        await Navigator.of(context).pushNamed('/product', arguments: product.id);
        onReturn?.call();
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Stack(
              children: [
                Positioned.fill(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      color: const Color(0xFFEEF1F5),
                      child: image == null
                          ? const Icon(Icons.image_outlined, color: Colors.black26)
                          : Image.network(
                              image,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.broken_image_outlined,
                                color: Colors.black26,
                              ),
                            ),
                    ),
                  ),
                ),
                Positioned(
                  top: 6,
                  right: 6,
                  child: FavoriteButton(productId: product.id, filled: true),
                ),
                if (unavailable)
                  Positioned(
                    left: 8,
                    bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.7),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        product.isActive ? 'Esgotado' : 'Indisponível',
                        style: const TextStyle(color: Colors.white, fontSize: 11),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            product.brand.name,
            style: theme.textTheme.labelSmall?.copyWith(color: Colors.black54),
          ),
          Text(
            product.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 4),
          Text(
            formatBrl(product.priceCents),
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          if (product.ratingCount > 0)
            Row(
              children: [
                RatingStars(value: product.ratingAvg, size: 13),
                const SizedBox(width: 4),
                Text(
                  '(${product.ratingCount})',
                  style: theme.textTheme.labelSmall?.copyWith(color: Colors.black54),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
