import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/formatters.dart';
import '../catalog/catalog_models.dart';
import '../catalog/catalog_repository.dart';
import 'admin_repository.dart';

/// US31 — cadastro e edição de produto: dados, ficha técnica, embalagem,
/// variações (cor/tamanho com SKU e estoque próprios) e imagens.
class AdminProductFormScreen extends ConsumerStatefulWidget {
  const AdminProductFormScreen({super.key, this.productId});

  /// null = novo produto.
  final String? productId;

  @override
  ConsumerState<AdminProductFormScreen> createState() =>
      _AdminProductFormScreenState();
}

class _SpecRow {
  _SpecRow(String label, String value)
      : label = TextEditingController(text: label),
        value = TextEditingController(text: value);
  final TextEditingController label;
  final TextEditingController value;
  void dispose() {
    label.dispose();
    value.dispose();
  }
}

class _AdminProductFormScreenState extends ConsumerState<AdminProductFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _weight = TextEditingController(text: '500');
  final _height = TextEditingController(text: '10');
  final _width = TextEditingController(text: '15');
  final _length = TextEditingController(text: '20');
  final List<_SpecRow> _specs = [];

  /// Só no cadastro: variações a criar junto com o produto.
  final List<VariantDraft> _newVariants = [];

  List<NamedRef> _categories = [];
  List<NamedRef> _brands = [];
  String? _categoryId;
  String? _brandId;

  AdminProduct? _product;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  bool get _isNew => widget.productId == null && _product == null;
  AdminRepository get _repo => ref.read(adminRepositoryProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_name, _description, _price, _weight, _height, _width, _length]) {
      c.dispose();
    }
    for (final s in _specs) {
      s.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final catalog = ref.read(catalogRepositoryProvider);
      final results = await Future.wait([catalog.categories(), catalog.brands()]);
      _categories = results[0];
      _brands = results[1];
      if (widget.productId != null || _product != null) {
        _fill(await _repo.get(_product?.id ?? widget.productId!));
      }
    } catch (e) {
      _error = _repo.mapError(e);
    }
    if (mounted) setState(() => _loading = false);
  }

  void _fill(AdminProduct p) {
    _product = p;
    _name.text = p.name;
    _description.text = p.description;
    _price.text = (p.priceCents / 100).toStringAsFixed(2).replaceAll('.', ',');
    _categoryId = p.categoryId;
    _brandId = p.brandId;
    _weight.text = '${p.weightGrams}';
    _height.text = '${p.heightCm}';
    _width.text = '${p.widthCm}';
    _length.text = '${p.lengthCm}';
    for (final s in _specs) {
      s.dispose();
    }
    _specs
      ..clear()
      ..addAll(p.specs.map((s) => _SpecRow(s.label, s.value)));
  }

  Future<void> _reload() async {
    final id = _product?.id;
    if (id == null) return;
    try {
      final p = await _repo.get(id);
      if (mounted) setState(() => _fill(p));
    } catch (e) {
      _snack(_repo.mapError(e));
    }
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Map<String, dynamic> _payload() {
    final specs = [
      for (final s in _specs)
        if (s.label.text.trim().isNotEmpty && s.value.text.trim().isNotEmpty)
          {'label': s.label.text.trim(), 'value': s.value.text.trim()},
    ];
    return {
      'name': _name.text.trim(),
      'description': _description.text.trim(),
      'priceCents': parseBrlToCents(_price.text),
      'categoryId': _categoryId,
      'brandId': _brandId,
      'specs': specs,
      'weightGrams': int.parse(_weight.text),
      'heightCm': int.parse(_height.text),
      'widthCm': int.parse(_width.text),
      'lengthCm': int.parse(_length.text),
    };
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_isNew && _newVariants.isEmpty) {
      setState(() => _error = 'Cadastre ao menos uma variação (cor/tamanho com estoque).');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final data = _payload();
      if (_isNew) {
        final created = await _repo.create({
          ...data,
          'variants': _newVariants.map((v) => v.toJson()).toList(),
        });
        _newVariants.clear();
        setState(() => _fill(created));
        _snack('Produto criado. Agora adicione as fotos.');
      } else {
        final updated = await _repo.update(_product!.id, data);
        setState(() => _fill(updated));
        _snack('Alterações salvas');
      }
    } catch (e) {
      setState(() => _error = _repo.mapError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleActive() async {
    final p = _product!;
    final activate = !p.isActive;
    if (!activate) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Desativar produto?'),
          content: const Text(
            'Ele sai da vitrine e da busca. Pedidos e favoritos antigos continuam '
            'abrindo o produto (como indisponível). Você pode reativar depois.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Desativar')),
          ],
        ),
      );
      if (ok != true) return;
    }
    try {
      if (activate) {
        await _repo.update(p.id, {'isActive': true});
      } else {
        await _repo.deactivate(p.id);
      }
      await _reload();
      _snack(activate ? 'Produto reativado' : 'Produto desativado');
    } catch (e) {
      _snack(_repo.mapError(e));
    }
  }

  Future<void> _newNamed({required bool category}) async {
    final ctrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(category ? 'Nova categoria' : 'Nova marca'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Nome'),
          onSubmitted: (v) => Navigator.pop(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: const Text('Criar')),
        ],
      ),
    );
    ctrl.dispose();
    if (name == null || name.trim().length < 2) return;
    try {
      final created = category
          ? await _repo.createCategory(name)
          : await _repo.createBrand(name);
      setState(() {
        if (category) {
          _categories = [..._categories, created];
          _categoryId = created.id;
        } else {
          _brands = [..._brands, created];
          _brandId = created.id;
        }
      });
    } catch (e) {
      _snack(_repo.mapError(e));
    }
  }

  Future<void> _variantDialog() async {
    final draft = await showDialog<VariantDraft>(
      context: context,
      builder: (_) => _VariantDialog(productName: _name.text),
    );
    if (draft == null) return;
    if (_isNew) {
      setState(() => _newVariants.add(draft));
      return;
    }
    try {
      await _repo.addVariant(_product!.id, draft);
      await _reload();
    } catch (e) {
      _snack(_repo.mapError(e));
    }
  }

  Future<void> _updateVariant(AdminVariant v, Map<String, dynamic> data) async {
    try {
      await _repo.updateVariant(v.id, data);
      await _reload();
    } catch (e) {
      _snack(_repo.mapError(e));
    }
  }

  Future<void> _addImage() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 2000,
      imageQuality: 90,
    );
    if (file == null) return;
    if (await file.length() > 5 * 1024 * 1024) {
      _snack('A imagem precisa ter no máximo 5MB');
      return;
    }
    try {
      await _repo.uploadImage(_product!.id, file);
      await _reload();
    } catch (e) {
      _snack(_repo.mapError(e));
    }
  }

  Future<void> _removeImage(AdminImage image) async {
    try {
      await _repo.removeImage(_product!.id, image.id);
      await _reload();
    } catch (e) {
      _snack(_repo.mapError(e));
    }
  }

  // ---------------- UI ----------------

  String? _required(String? v, {int min = 1}) =>
      v == null || v.trim().length < min ? 'Obrigatório' : null;

  String? _positiveInt(String? v) {
    final n = int.tryParse(v ?? '');
    return n == null || n < 1 ? 'Número inteiro maior que zero' : null;
  }

  Widget _section(String title, List<Widget> children, {Widget? action}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
                if (action != null) action,
              ],
            ),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _dropdown({
    required String label,
    required List<NamedRef> options,
    required String? value,
    required ValueChanged<String?> onChanged,
    required VoidCallback onCreate,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: DropdownButtonFormField<String>(
            // A key muda quando a opção muda (ex.: categoria recém-criada) e
            // recria o campo com o novo valor inicial.
            key: ValueKey('$label-$value-${options.length}'),
            initialValue: options.any((o) => o.id == value) ? value : null,
            isExpanded: true,
            decoration: InputDecoration(labelText: label),
            items: [
              for (final o in options) DropdownMenuItem(value: o.id, child: Text(o.name)),
            ],
            onChanged: onChanged,
            validator: (v) => v == null ? 'Obrigatório' : null,
          ),
        ),
        IconButton(
          tooltip: 'Criar nova',
          onPressed: onCreate,
          icon: const Icon(Icons.add_circle_outline),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = _product;
    final digits = [FilteringTextInputFormatter.digitsOnly];

    return Scaffold(
      appBar: AppBar(
        title: Text(_isNew ? 'Novo produto' : 'Editar produto'),
        actions: [
          if (p != null)
            TextButton.icon(
              onPressed: _toggleActive,
              icon: Icon(p.isActive ? Icons.visibility_off_outlined : Icons.visibility_outlined),
              label: Text(p.isActive ? 'Desativar' : 'Reativar'),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 820),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (p != null && !p.isActive)
                            Container(
                              margin: const EdgeInsets.only(bottom: 16),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF1F3F5),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Text(
                                'Produto desativado: não aparece na vitrine nem na busca.',
                              ),
                            ),
                          _section('Informações', [
                            TextFormField(
                              controller: _name,
                              decoration: const InputDecoration(labelText: 'Nome'),
                              validator: (v) => _required(v, min: 2),
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _description,
                              maxLines: 4,
                              decoration: const InputDecoration(
                                labelText: 'Descrição',
                                alignLabelWithHint: true,
                              ),
                              validator: (v) => v == null || v.trim().length < 10
                                  ? 'Mínimo de 10 caracteres'
                                  : null,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _price,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: const InputDecoration(
                                labelText: 'Preço',
                                prefixText: 'R\$ ',
                              ),
                              validator: (v) {
                                final cents = parseBrlToCents(v ?? '');
                                return cents == null || cents < 1 ? 'Preço inválido' : null;
                              },
                            ),
                            const SizedBox(height: 12),
                            _dropdown(
                              label: 'Categoria',
                              options: _categories,
                              value: _categoryId,
                              onChanged: (v) => setState(() => _categoryId = v),
                              onCreate: () => _newNamed(category: true),
                            ),
                            const SizedBox(height: 12),
                            _dropdown(
                              label: 'Marca',
                              options: _brands,
                              value: _brandId,
                              onChanged: (v) => setState(() => _brandId = v),
                              onCreate: () => _newNamed(category: false),
                            ),
                          ]),
                          _section(
                            'Ficha técnica',
                            [
                              if (_specs.isEmpty)
                                const Text(
                                  'Ex.: Material — Algodão; Peso — 520 g.',
                                  style: TextStyle(color: Colors.black54),
                                ),
                              for (final s in _specs)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        flex: 2,
                                        child: TextField(
                                          controller: s.label,
                                          decoration: const InputDecoration(
                                            labelText: 'Característica',
                                            isDense: true,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        flex: 3,
                                        child: TextField(
                                          controller: s.value,
                                          decoration: const InputDecoration(
                                            labelText: 'Valor',
                                            isDense: true,
                                          ),
                                        ),
                                      ),
                                      IconButton(
                                        tooltip: 'Remover',
                                        onPressed: () => setState(() {
                                          _specs.remove(s);
                                          s.dispose();
                                        }),
                                        icon: const Icon(Icons.close),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                            action: TextButton.icon(
                              onPressed: () => setState(() => _specs.add(_SpecRow('', ''))),
                              icon: const Icon(Icons.add),
                              label: const Text('Adicionar'),
                            ),
                          ),
                          _section('Embalagem (usada no cálculo de frete)', [
                            Wrap(
                              spacing: 12,
                              runSpacing: 12,
                              children: [
                                for (final (ctrl, label) in [
                                  (_weight, 'Peso (g)'),
                                  (_height, 'Altura (cm)'),
                                  (_width, 'Largura (cm)'),
                                  (_length, 'Comprimento (cm)'),
                                ])
                                  SizedBox(
                                    width: 170,
                                    child: TextFormField(
                                      controller: ctrl,
                                      keyboardType: TextInputType.number,
                                      inputFormatters: digits,
                                      decoration: InputDecoration(labelText: label, isDense: true),
                                      validator: _positiveInt,
                                    ),
                                  ),
                              ],
                            ),
                          ]),
                          _section(
                            'Variações e estoque',
                            _isNew ? _newVariantTiles() : _variantTiles(p!),
                            action: TextButton.icon(
                              onPressed: _variantDialog,
                              icon: const Icon(Icons.add),
                              label: const Text('Variação'),
                            ),
                          ),
                          if (p != null)
                            _section(
                              'Fotos',
                              [
                                Wrap(
                                  spacing: 10,
                                  runSpacing: 10,
                                  children: [
                                    for (final img in p.images)
                                      Stack(
                                        clipBehavior: Clip.none,
                                        children: [
                                          ClipRRect(
                                            borderRadius: BorderRadius.circular(8),
                                            child: Image.network(
                                              mediaUrl(img.url)!,
                                              width: 110,
                                              height: 110,
                                              fit: BoxFit.cover,
                                              errorBuilder: (_, __, ___) => Container(
                                                width: 110,
                                                height: 110,
                                                color: const Color(0xFFEEF1F5),
                                              ),
                                            ),
                                          ),
                                          Positioned(
                                            top: -8,
                                            right: -8,
                                            child: IconButton.filledTonal(
                                              tooltip: 'Remover foto',
                                              visualDensity: VisualDensity.compact,
                                              iconSize: 16,
                                              onPressed: () => _removeImage(img),
                                              icon: const Icon(Icons.close),
                                            ),
                                          ),
                                        ],
                                      ),
                                    if (p.images.length < 12)
                                      InkWell(
                                        onTap: _addImage,
                                        borderRadius: BorderRadius.circular(8),
                                        child: Container(
                                          width: 110,
                                          height: 110,
                                          decoration: BoxDecoration(
                                            borderRadius: BorderRadius.circular(8),
                                            border: Border.all(color: Colors.black26),
                                          ),
                                          child: const Column(
                                            mainAxisAlignment: MainAxisAlignment.center,
                                            children: [
                                              Icon(Icons.add_photo_alternate_outlined),
                                              SizedBox(height: 4),
                                              Text('PNG/JPG até 5MB', style: TextStyle(fontSize: 11)),
                                            ],
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  'A primeira foto é a capa do produto na vitrine.',
                                  style: TextStyle(color: Colors.black54),
                                ),
                              ],
                            )
                          else
                            const Padding(
                              padding: EdgeInsets.only(bottom: 16),
                              child: Text(
                                'As fotos podem ser enviadas depois de criar o produto.',
                                style: TextStyle(color: Colors.black54),
                              ),
                            ),
                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Text(_error!, style: const TextStyle(color: Colors.red)),
                            ),
                          ElevatedButton(
                            onPressed: _saving ? null : _save,
                            child: _saving
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : Text(_isNew ? 'Criar produto' : 'Salvar alterações'),
                          ),
                          const SizedBox(height: 32),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  List<Widget> _newVariantTiles() {
    if (_newVariants.isEmpty) {
      return const [
        Text(
          'Cada combinação de cor e tamanho é uma variação, com SKU e estoque próprios.',
          style: TextStyle(color: Colors.black54),
        ),
      ];
    }
    return [
      for (final v in _newVariants)
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text([
            if (v.color?.isNotEmpty == true) v.color!,
            if (v.size?.isNotEmpty == true) 'Tam. ${v.size}',
          ].join(' · ').ifEmpty('Variação única')),
          subtitle: Text('SKU ${v.sku}'),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${v.stock} un.'),
              IconButton(
                tooltip: 'Remover',
                onPressed: () => setState(() => _newVariants.remove(v)),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ),
    ];
  }

  List<Widget> _variantTiles(AdminProduct p) {
    if (p.variants.isEmpty) {
      return const [Text('Nenhuma variação cadastrada.')];
    }
    return [
      for (final v in p.variants)
        _VariantTile(
          key: ValueKey('${v.id}-${v.stock}-${v.isActive}'),
          variant: v,
          onSaveStock: (stock) => _updateVariant(v, {'stock': stock}),
          onToggleActive: (active) => _updateVariant(v, {'isActive': active}),
        ),
    ];
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}

class _VariantTile extends StatefulWidget {
  const _VariantTile({
    super.key,
    required this.variant,
    required this.onSaveStock,
    required this.onToggleActive,
  });

  final AdminVariant variant;
  final ValueChanged<int> onSaveStock;
  final ValueChanged<bool> onToggleActive;

  @override
  State<_VariantTile> createState() => _VariantTileState();
}

class _VariantTileState extends State<_VariantTile> {
  late final _stock = TextEditingController(text: '${widget.variant.stock}');

  @override
  void dispose() {
    _stock.dispose();
    super.dispose();
  }

  bool get _changed => int.tryParse(_stock.text) != widget.variant.stock;

  @override
  Widget build(BuildContext context) {
    final v = widget.variant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  v.label,
                  style: v.isActive ? null : const TextStyle(color: Colors.black45),
                ),
                Text('SKU ${v.sku}', style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          SizedBox(
            width: 90,
            child: TextField(
              controller: _stock,
              enabled: v.isActive,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Estoque', isDense: true),
              onChanged: (_) => setState(() {}),
              onSubmitted: (t) {
                final n = int.tryParse(t);
                if (n != null) widget.onSaveStock(n);
              },
            ),
          ),
          IconButton(
            tooltip: 'Salvar estoque',
            onPressed: v.isActive && _changed && int.tryParse(_stock.text) != null
                ? () => widget.onSaveStock(int.parse(_stock.text))
                : null,
            icon: const Icon(Icons.check),
          ),
          Tooltip(
            message: v.isActive ? 'Variação à venda' : 'Variação desativada',
            child: Switch(value: v.isActive, onChanged: widget.onToggleActive),
          ),
        ],
      ),
    );
  }
}

class _VariantDialog extends StatefulWidget {
  const _VariantDialog({required this.productName});
  final String productName;

  @override
  State<_VariantDialog> createState() => _VariantDialogState();
}

class _VariantDialogState extends State<_VariantDialog> {
  final _formKey = GlobalKey<FormState>();
  final _color = TextEditingController();
  final _hex = TextEditingController();
  final _size = TextEditingController();
  final _stock = TextEditingController(text: '0');
  final _sku = TextEditingController();
  bool _skuEdited = false;

  @override
  void initState() {
    super.initState();
    _sku.text = suggestSku(widget.productName, null, null);
  }

  @override
  void dispose() {
    for (final c in [_color, _hex, _size, _stock, _sku]) {
      c.dispose();
    }
    super.dispose();
  }

  void _refreshSku() {
    if (_skuEdited) return;
    _sku.text = suggestSku(widget.productName, _color.text, _size.text);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Nova variação'),
      content: SizedBox(
        width: 380,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _color,
                decoration: const InputDecoration(labelText: 'Cor (opcional)'),
                onChanged: (_) => _refreshSku(),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _hex,
                decoration: const InputDecoration(
                  labelText: 'Código da cor (opcional)',
                  hintText: '#1F2328',
                ),
                validator: (v) => v == null ||
                        v.isEmpty ||
                        RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(v)
                    ? null
                    : 'Use o formato #RRGGBB',
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _size,
                decoration: const InputDecoration(labelText: 'Tamanho (opcional)'),
                onChanged: (_) => _refreshSku(),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _stock,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(labelText: 'Estoque inicial'),
                validator: (v) => int.tryParse(v ?? '') == null ? 'Informe um número' : null,
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _sku,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'SKU',
                  helperText: 'Gerado automaticamente; pode editar',
                ),
                onChanged: (_) => _skuEdited = true,
                validator: (v) => RegExp(r'^[A-Z0-9-]{3,40}$').hasMatch(v ?? '')
                    ? null
                    : 'Letras maiúsculas, números e hífen (3 a 40)',
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(
          onPressed: () {
            if (!_formKey.currentState!.validate()) return;
            Navigator.pop(
              context,
              VariantDraft(
                sku: _sku.text,
                color: _color.text,
                colorHex: _hex.text,
                size: _size.text,
                stock: int.parse(_stock.text),
              ),
            );
          },
          child: const Text('Adicionar'),
        ),
      ],
    );
  }
}
