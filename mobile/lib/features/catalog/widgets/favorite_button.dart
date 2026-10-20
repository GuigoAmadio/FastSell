import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../favorites/favorites_controller.dart';

/// Coração de favorito (US13): 1 toque adiciona/remove, estado compartilhado
/// entre vitrine, detalhes e lista de desejos.
class FavoriteButton extends ConsumerWidget {
  const FavoriteButton({super.key, required this.productId, this.filled = false});

  final String productId;

  /// true = botão com fundo (sobre imagem); false = só o ícone.
  final bool filled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isFavorite = ref.watch(
      favoritesControllerProvider.select((ids) => ids.contains(productId)),
    );
    final color = isFavorite ? const Color(0xFFD93848) : Colors.black87;

    final icon = AnimatedSwitcher(
      duration: const Duration(milliseconds: 150),
      transitionBuilder: (child, anim) => ScaleTransition(scale: anim, child: child),
      child: Icon(
        isFavorite ? Icons.favorite : Icons.favorite_border,
        key: ValueKey(isFavorite),
        color: color,
        size: 22,
      ),
    );

    Future<void> onTap() async {
      final error =
          await ref.read(favoritesControllerProvider.notifier).toggle(productId);
      if (error != null && context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error)));
      }
    }

    return Semantics(
      button: true,
      label: isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
      child: filled
          ? Material(
              color: Colors.white.withValues(alpha: 0.92),
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onTap,
                child: Padding(padding: const EdgeInsets.all(7), child: icon),
              ),
            )
          : IconButton(onPressed: onTap, icon: icon),
    );
  }
}
