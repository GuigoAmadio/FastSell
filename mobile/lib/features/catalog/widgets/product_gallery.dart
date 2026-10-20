import 'package:flutter/material.dart';
import '../../../core/formatters.dart';
import '../catalog_models.dart';

/// US11 — carrossel de fotos. Toque abre em tela cheia com zoom
/// (pinça ou toque duplo) e deslize entre as fotos.
class ProductGallery extends StatefulWidget {
  const ProductGallery({super.key, required this.images, required this.heroPrefix});

  final List<ProductImage> images;
  final String heroPrefix;

  @override
  State<ProductGallery> createState() => _ProductGalleryState();
}

class _ProductGalleryState extends State<ProductGallery> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _openFullscreen() {
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: true,
        pageBuilder: (_, __, ___) => _FullscreenGallery(
          images: widget.images,
          initialIndex: _index,
          heroPrefix: widget.heroPrefix,
          onIndexChanged: (i) {
            if (!mounted) return;
            setState(() => _index = i);
            _controller.jumpToPage(i);
          },
        ),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.images.isEmpty) {
      return AspectRatio(
        aspectRatio: 1,
        child: Container(
          color: const Color(0xFFEEF1F5),
          child: const Icon(Icons.image_outlined, size: 48, color: Colors.black26),
        ),
      );
    }

    return Column(
      children: [
        AspectRatio(
          aspectRatio: 1,
          child: Stack(
            children: [
              PageView.builder(
                controller: _controller,
                itemCount: widget.images.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (_, i) => GestureDetector(
                  onTap: _openFullscreen,
                  child: Hero(
                    tag: '${widget.heroPrefix}-$i',
                    child: Container(
                      color: const Color(0xFFEEF1F5),
                      child: Image.network(
                        mediaUrl(widget.images[i].url)!,
                        fit: BoxFit.cover,
                        semanticLabel: widget.images[i].alt,
                        errorBuilder: (_, __, ___) => const Icon(
                          Icons.broken_image_outlined,
                          color: Colors.black26,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 12,
                bottom: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.zoom_in, size: 14, color: Colors.white),
                      const SizedBox(width: 4),
                      Text(
                        '${_index + 1}/${widget.images.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        if (widget.images.length > 1)
          SizedBox(
            height: 64,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              scrollDirection: Axis.horizontal,
              itemCount: widget.images.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final selected = i == _index;
                return GestureDetector(
                  onTap: () => _controller.animateToPage(
                    i,
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOut,
                  ),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: 48,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: selected ? Colors.black87 : Colors.transparent,
                        width: 1.5,
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Image.network(
                      mediaUrl(widget.images[i].url)!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }
}

class _FullscreenGallery extends StatefulWidget {
  const _FullscreenGallery({
    required this.images,
    required this.initialIndex,
    required this.heroPrefix,
    required this.onIndexChanged,
  });

  final List<ProductImage> images;
  final int initialIndex;
  final String heroPrefix;
  final ValueChanged<int> onIndexChanged;

  @override
  State<_FullscreenGallery> createState() => _FullscreenGalleryState();
}

class _FullscreenGalleryState extends State<_FullscreenGallery> {
  late final PageController _controller =
      PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;
  final _transform = TransformationController();
  bool _zoomed = false;
  TapDownDetails? _doubleTapDetails;

  @override
  void dispose() {
    _controller.dispose();
    _transform.dispose();
    super.dispose();
  }

  void _handleDoubleTap() {
    if (_zoomed) {
      _transform.value = Matrix4.identity();
    } else {
      final pos = _doubleTapDetails?.localPosition ?? Offset.zero;
      // zoom 2,5x centrado no ponto tocado
      // Matriz montada direto (escala 2,5 + deslocamento): funciona em qualquer
      // versão do vector_math, sem os métodos translate/scale (depreciados).
      _transform.value = Matrix4.identity()
        ..setEntry(0, 0, 2.5)
        ..setEntry(1, 1, 2.5)
        ..setEntry(0, 3, -pos.dx * 1.5)
        ..setEntry(1, 3, -pos.dy * 1.5);
    }
    setState(() => _zoomed = !_zoomed);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text('${_index + 1} de ${widget.images.length}'),
      ),
      body: PageView.builder(
        controller: _controller,
        // Com zoom ativo o arraste move a imagem em vez de trocar de foto.
        physics: _zoomed
            ? const NeverScrollableScrollPhysics()
            : const PageScrollPhysics(),
        itemCount: widget.images.length,
        onPageChanged: (i) {
          _transform.value = Matrix4.identity();
          setState(() {
            _index = i;
            _zoomed = false;
          });
          widget.onIndexChanged(i);
        },
        itemBuilder: (_, i) => GestureDetector(
          onDoubleTapDown: (d) => _doubleTapDetails = d,
          onDoubleTap: _handleDoubleTap,
          child: InteractiveViewer(
            transformationController: i == _index ? _transform : null,
            minScale: 1,
            maxScale: 5,
            onInteractionEnd: (_) {
              final zoomed = _transform.value.getMaxScaleOnAxis() > 1.01;
              if (zoomed != _zoomed) setState(() => _zoomed = zoomed);
            },
            child: Center(
              child: Hero(
                tag: '${widget.heroPrefix}-$i',
                child: Image.network(
                  mediaUrl(widget.images[i].url)!,
                  fit: BoxFit.contain,
                  semanticLabel: widget.images[i].alt,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// US11 (computador) — galeria no estilo das grandes lojas: miniaturas na
/// vertical à esquerda, foto grande ao lado com zoom ao passar o mouse
/// e clique para abrir em tela cheia.
class DesktopProductGallery extends StatefulWidget {
  const DesktopProductGallery({
    super.key,
    required this.images,
    required this.heroPrefix,
  });

  final List<ProductImage> images;
  final String heroPrefix;

  @override
  State<DesktopProductGallery> createState() => _DesktopProductGalleryState();
}

class _DesktopProductGalleryState extends State<DesktopProductGallery> {
  static const _zoom = 2.4;
  int _index = 0;

  /// Posição do mouse na foto (0..1); null = sem zoom.
  Offset? _hover;

  void _openFullscreen() {
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        pageBuilder: (_, __, ___) => _FullscreenGallery(
          images: widget.images,
          initialIndex: _index,
          heroPrefix: widget.heroPrefix,
          onIndexChanged: (i) {
            if (mounted) setState(() => _index = i);
          },
        ),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.images.isEmpty) {
      return AspectRatio(
        aspectRatio: 1,
        child: Container(
          color: const Color(0xFFF5F6F8),
          child: const Icon(Icons.image_outlined, size: 64, color: Colors.black26),
        ),
      );
    }

    final url = mediaUrl(widget.images[_index].url)!;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 64,
          child: Column(
            children: [
              for (var i = 0; i < widget.images.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: MouseRegion(
                    // passar o mouse na miniatura já troca a foto, como nas lojas
                    onEnter: (_) => setState(() => _index = i),
                    cursor: SystemMouseCursors.click,
                    child: GestureDetector(
                      onTap: () => setState(() => _index = i),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 120),
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: i == _index
                                ? const Color(0xFF3483FA)
                                : const Color(0xFFE3E6EA),
                            width: i == _index ? 2 : 1,
                          ),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Image.network(
                          mediaUrl(widget.images[i].url)!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 640),
            child: AspectRatio(
              aspectRatio: 1,
              child: LayoutBuilder(
                builder: (context, box) => MouseRegion(
                  cursor: SystemMouseCursors.zoomIn,
                  onHover: (e) => setState(() {
                    _hover = Offset(
                      (e.localPosition.dx / box.maxWidth).clamp(0.0, 1.0),
                      (e.localPosition.dy / box.maxHeight).clamp(0.0, 1.0),
                    );
                  }),
                  onExit: (_) => setState(() => _hover = null),
                  child: GestureDetector(
                    onTap: _openFullscreen,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        color: const Color(0xFFF5F6F8),
                        child: Hero(
                          tag: '${widget.heroPrefix}-$_index',
                          child: _hover == null
                              ? Image.network(
                                  url,
                                  fit: BoxFit.contain,
                                  semanticLabel: widget.images[_index].alt,
                                  errorBuilder: (_, __, ___) => const Center(
                                    child: Icon(
                                      Icons.broken_image_outlined,
                                      color: Colors.black26,
                                    ),
                                  ),
                                )
                              // Zoom: a foto amplia em volta do ponto do mouse.
                              : Transform.scale(
                                  scale: _zoom,
                                  alignment: Alignment(
                                    _hover!.dx * 2 - 1,
                                    _hover!.dy * 2 - 1,
                                  ),
                                  child: Image.network(url, fit: BoxFit.contain),
                                ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
