import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/formatters.dart';
import '../../core/input_masks.dart';
import '../../core/validators.dart';
import 'cart_controller.dart';
import 'cart_models.dart';
import 'cart_repository.dart';

/// US14 + US15 — carrinho com quantidades, remoção, subtotais instantâneos,
/// alerta de estoque, simulação de frete por CEP e finalização do pedido.
class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  final _cep = TextEditingController();
  List<ShippingOption>? _options;
  String? _selectedService;
  String? _shippingError;
  bool _quoting = false;
  bool _checkingOut = false;

  @override
  void dispose() {
    _cep.dispose();
    super.dispose();
  }

  Future<void> _quote() async {
    FocusScope.of(context).unfocus();
    if (!isValidCep(_cep.text)) {
      setState(() => _shippingError = 'CEP inválido');
      return;
    }
    setState(() {
      _quoting = true;
      _shippingError = null;
      _options = null;
      _selectedService = null;
    });
    final repo = ref.read(cartRepositoryProvider);
    try {
      final options = await repo.quote(onlyDigits(_cep.text));
      if (!mounted) return;
      setState(() {
        _options = options;
        _selectedService = options
                .where((o) => o.isEconomic)
                .map((o) => o.serviceId)
                .firstOrNull ??
            options.firstOrNull?.serviceId;
      });
    } catch (e) {
      final problem = repo.problem(e);
      if (!mounted) return;
      setState(() {
        _shippingError = problem.code == 'SHIPPING_NOT_CONFIGURED'
            ? 'Cálculo de frete ainda não disponível nesta loja. '
                'Você pode finalizar e combinar a entrega depois.'
            : problem.message;
      });
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  Future<void> _checkout() async {
    final controller = ref.read(cartControllerProvider.notifier);
    setState(() => _checkingOut = true);
    try {
      // Validação de estoque antes do checkout (US14).
      final ok = await controller.validate();
      if (!ok) {
        _snack('Revise os itens destacados antes de finalizar.');
        return;
      }
      final orderId = await ref
          .read(cartRepositoryProvider)
          .checkout(shippingServiceId: _selectedService);
      await controller.load();
      if (!mounted) return;
      setState(() {
        _options = null;
        _selectedService = null;
      });
      await Navigator.of(context).pushNamed('/order', arguments: orderId);
    } catch (e) {
      final problem = ref.read(cartRepositoryProvider).problem(e);
      if (problem.code == 'PROFILE_INCOMPLETE') {
        _snack(problem.message, action: ('Completar perfil', '/profile'));
      } else if (problem.code == 'ADDRESS_REQUIRED') {
        _snack(problem.message, action: ('Endereços', '/addresses'));
      } else {
        _snack(problem.message);
        await controller.load();
      }
    } finally {
      if (mounted) setState(() => _checkingOut = false);
    }
  }

  void _snack(String text, {(String, String)? action}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        action: action == null
            ? null
            : SnackBarAction(
                label: action.$1,
                onPressed: () => Navigator.of(context).pushNamed(action.$2),
              ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartControllerProvider);
    final theme = Theme.of(context);
    final shipping = _options?.where((o) => o.serviceId == _selectedService).firstOrNull;
    final total = cart.subtotalCents + (shipping?.priceCents ?? 0);

    return Scaffold(
      appBar: AppBar(title: const Text('Carrinho')),
      body: cart.loading && cart.items.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : cart.items.isEmpty
              ? _EmptyCart(error: cart.error)
              : RefreshIndicator(
                  onRefresh: () => ref.read(cartControllerProvider.notifier).load(),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    children: [
                      for (final item in cart.items)
                        _CartLine(item: item, alert: cart.alerts[item.id]),
                      const SizedBox(height: 16),
                      Text('Frete e prazo', style: theme.textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _cep,
                              keyboardType: TextInputType.number,
                              inputFormatters: [MaskFormatter(formatCep)],
                              decoration: const InputDecoration(
                                labelText: 'CEP',
                                hintText: '00000-000',
                                isDense: true,
                              ),
                              onSubmitted: (_) => _quote(),
                            ),
                          ),
                          const SizedBox(width: 12),
                          SizedBox(
                            height: 48,
                            child: OutlinedButton(
                              onPressed: _quoting ? null : _quote,
                              child: _quoting
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    )
                                  : const Text('Calcular'),
                            ),
                          ),
                        ],
                      ),
                      if (_shippingError != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            _shippingError!,
                            style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                          ),
                        ),
                      if (_options != null)
                        for (final o in _options!)
                          RadioListTile<String>(
                            contentPadding: EdgeInsets.zero,
                            value: o.serviceId,
                            // ignore: deprecated_member_use
                            groupValue: _selectedService,
                            // ignore: deprecated_member_use
                            onChanged: (v) => setState(() => _selectedService = v),
                            title: Row(
                              children: [
                                Flexible(child: Text('${o.carrier} · ${o.service}')),
                                if (o.isEconomic) const _Tag('Econômico'),
                                if (o.isExpress) const _Tag('Expresso'),
                              ],
                            ),
                            subtitle: Text(
                              'Até ${o.deliveryDays} ${o.deliveryDays == 1 ? 'dia útil' : 'dias úteis'}',
                            ),
                            secondary: Text(formatBrl(o.priceCents)),
                          ),
                      const Divider(height: 32),
                      _SummaryRow('Subtotal (${cart.itemsCount} itens)', formatBrl(cart.subtotalCents)),
                      _SummaryRow(
                        'Frete',
                        shipping == null ? 'a calcular' : formatBrl(shipping.priceCents),
                      ),
                      const SizedBox(height: 4),
                      _SummaryRow('Total', formatBrl(total), bold: true),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _checkingOut || cart.hasIssues ? null : _checkout,
                        child: _checkingOut
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Finalizar pedido'),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        cart.hasIssues
                            ? 'Ajuste os itens com alerta para continuar.'
                            : 'Pagamento será integrado em uma próxima sprint: o pedido é registrado como confirmado.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _CartLine extends ConsumerWidget {
  const _CartLine({required this.item, required this.alert});

  final CartItem item;
  final String? alert;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(cartControllerProvider.notifier);
    final theme = Theme.of(context);
    final image = mediaUrl(item.imageUrl);
    final canIncrease = item.quantity < item.maxQuantity;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GestureDetector(
                onTap: () => Navigator.of(context).pushNamed('/product', arguments: item.productId),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    width: 76,
                    height: 76,
                    color: const Color(0xFFEEF1F5),
                    child: image == null
                        ? const Icon(Icons.image_outlined, color: Colors.black26)
                        : Image.network(image, fit: BoxFit.cover),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.productName, maxLines: 2, overflow: TextOverflow.ellipsis),
                    if (item.variantLabel != null)
                      Text(
                        item.variantLabel!,
                        style: theme.textTheme.bodySmall?.copyWith(color: Colors.black54),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      '${formatBrl(item.unitPriceCents)} cada',
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _QtyButton(
                          icon: Icons.remove,
                          onTap: item.quantity > 1
                              ? () => controller.setQuantity(item, item.quantity - 1)
                              : null,
                        ),
                        SizedBox(
                          width: 36,
                          child: Text(
                            '${item.quantity}',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.titleSmall,
                          ),
                        ),
                        // O + continua tocável no limite: o toque mostra o alerta de estoque.
                        _QtyButton(
                          icon: Icons.add,
                          muted: !canIncrease,
                          onTap: () => controller.setQuantity(item, item.quantity + 1),
                        ),
                        const Spacer(),
                        Text(
                          formatBrl(item.subtotalCents),
                          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Remover',
                onPressed: () => controller.remove(item),
                icon: const Icon(Icons.delete_outline),
              ),
            ],
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 150),
            child: alert == null
                ? const SizedBox(width: double.infinity)
                : Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(top: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF4E5),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFF2C27B)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.warning_amber_rounded, size: 18, color: Color(0xFFB26A00)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(alert!, style: const TextStyle(color: Color(0xFF7A4A00))),
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({required this.icon, required this.onTap, this.muted = false});

  final IconData icon;
  final VoidCallback? onTap;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null || muted;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: disabled ? Colors.black12 : Colors.black26),
        ),
        child: Icon(icon, size: 18, color: disabled ? Colors.black26 : Colors.black87),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 6),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFFE8F0FE),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(text, style: const TextStyle(fontSize: 11, color: Color(0xFF1A56C4))),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow(this.label, this.value, {this.bold = false});

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final style = bold
        ? Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)
        : Theme.of(context).textTheme.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Text(label, style: style),
          const Spacer(),
          Text(value, style: style),
        ],
      ),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart({this.error});
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.shopping_bag_outlined, size: 44, color: Colors.black38),
            const SizedBox(height: 12),
            Text(error ?? 'Seu carrinho está vazio.'),
          ],
        ),
      ),
    );
  }
}
