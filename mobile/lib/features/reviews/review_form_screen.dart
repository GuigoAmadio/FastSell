import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../catalog/catalog_repository.dart';
import '../catalog/widgets/rating_stars.dart';

/// US12 — formulário de avaliação: nota de 1 a 5, comentário e até 3 fotos
/// (PNG/JPG até 5MB). A API confere se a pessoa comprou o produto.
class ReviewFormScreen extends ConsumerStatefulWidget {
  const ReviewFormScreen({super.key, required this.productId, required this.productName});

  final String productId;
  final String productName;

  @override
  ConsumerState<ReviewFormScreen> createState() => _ReviewFormScreenState();
}

class _ReviewFormScreenState extends ConsumerState<ReviewFormScreen> {
  static const _maxPhotos = 3;
  static const _labels = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente'];

  int _rating = 0;
  final _comment = TextEditingController();
  final List<XFile> _photos = [];
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _addPhoto() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (file == null) return;
    final size = await file.length();
    if (size > 5 * 1024 * 1024) {
      setState(() => _error = 'Cada foto pode ter no máximo 5MB');
      return;
    }
    setState(() {
      _photos.add(file);
      _error = null;
    });
  }

  Future<void> _submit() async {
    if (_rating == 0) {
      setState(() => _error = 'Escolha de 1 a 5 estrelas');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    final repo = ref.read(catalogRepositoryProvider);
    try {
      await repo.createReview(
        productId: widget.productId,
        rating: _rating,
        comment: _comment.text,
        photos: List.of(_photos),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Obrigado! Sua avaliação foi publicada.')),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = repo.mapError(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Avaliar produto')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(widget.productName, style: theme.textTheme.titleMedium),
          const SizedBox(height: 20),
          Row(
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  tooltip: '$i ${i == 1 ? 'estrela' : 'estrelas'}',
                  iconSize: 36,
                  onPressed: () => setState(() => _rating = i),
                  icon: Icon(
                    i <= _rating ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: starColor,
                  ),
                ),
            ],
          ),
          if (_rating > 0)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Text(_labels[_rating], style: theme.textTheme.bodySmall),
            ),
          const SizedBox(height: 20),
          TextField(
            controller: _comment,
            maxLines: 5,
            maxLength: 2000,
            decoration: const InputDecoration(
              labelText: 'Comentário (opcional)',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 8),
          Text('Fotos (até $_maxPhotos)', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              for (var i = 0; i < _photos.length; i++)
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: kIsWeb
                          ? Image.network(_photos[i].path, width: 80, height: 80, fit: BoxFit.cover)
                          : Image.file(File(_photos[i].path), width: 80, height: 80, fit: BoxFit.cover),
                    ),
                    Positioned(
                      top: -8,
                      right: -8,
                      child: IconButton.filledTonal(
                        visualDensity: VisualDensity.compact,
                        iconSize: 16,
                        onPressed: () => setState(() => _photos.removeAt(i)),
                        icon: const Icon(Icons.close),
                      ),
                    ),
                  ],
                ),
              if (_photos.length < _maxPhotos)
                InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: _sending ? null : _addPhoto,
                  child: Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.black26),
                    ),
                    child: const Icon(Icons.add_a_photo_outlined),
                  ),
                ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _sending ? null : _submit,
            child: _sending
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Publicar avaliação'),
          ),
        ],
      ),
    );
  }
}
