import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../auth/auth_controller.dart';
import '../reviews/review_form_screen.dart';

// ---------------- modelos ----------------

const orderStatusLabels = {
  'PENDING_PAYMENT': 'Aguardando pagamento',
  'CONFIRMED': 'Confirmado',
  'SHIPPED': 'Enviado',
  'DELIVERED': 'Entregue',
  'CANCELLED': 'Cancelado',
};

class OrderSummary {
  OrderSummary({
    required this.id,
    required this.number,
    required this.status,
    required this.totalCents,
    required this.createdAt,
    required this.itemsCount,
    required this.firstItemName,
  });

  final String id;
  final int number;
  final String status;
  final int totalCents;
  final DateTime createdAt;
  final int itemsCount;
  final String? firstItemName;

  factory OrderSummary.fromJson(Map<String, dynamic> j) => OrderSummary(
        id: j['id'] as String,
        number: j['number'] as int,
        status: j['status'] as String,
        totalCents: j['totalCents'] as int,
        createdAt: DateTime.parse(j['createdAt'] as String),
        itemsCount: j['itemsCount'] as int? ?? 0,
        firstItemName: j['firstItemName'] as String?,
      );
}

class OrderItem {
  OrderItem({
    required this.productId,
    required this.productName,
    required this.variantLabel,
    required this.imageUrl,
    required this.quantity,
    required this.subtotalCents,
    required this.canReview,
    required this.reviewed,
  });

  final String productId;
  final String productName;
  final String? variantLabel;
  final String? imageUrl;
  final int quantity;
  final int subtotalCents;
  final bool canReview;
  final bool reviewed;

  factory OrderItem.fromJson(Map<String, dynamic> j) => OrderItem(
        productId: j['productId'] as String,
        productName: j['productName'] as String,
        variantLabel: j['variantLabel'] as String?,
        imageUrl: j['imageUrl'] as String?,
        quantity: j['quantity'] as int,
        subtotalCents: j['subtotalCents'] as int,
        canReview: j['canReview'] as bool? ?? false,
        reviewed: j['review'] != null,
      );
}

class OrderDetail {
  OrderDetail({
    required this.id,
    required this.number,
    required this.status,
    required this.subtotalCents,
    required this.shippingCents,
    required this.totalCents,
    required this.shippingText,
    required this.addressText,
    required this.createdAt,
    required this.items,
  });

  final String id;
  final int number;
  final String status;
  final int subtotalCents;
  final int shippingCents;
  final int totalCents;
  final String? shippingText;
  final String addressText;
  final DateTime createdAt;
  final List<OrderItem> items;

  factory OrderDetail.fromJson(Map<String, dynamic> j) {
    final shipping = j['shipping'] as Map<String, dynamic>?;
    final a = j['shippingAddress'] as Map<String, dynamic>? ?? const {};
    return OrderDetail(
      id: j['id'] as String,
      number: j['number'] as int,
      status: j['status'] as String,
      subtotalCents: j['subtotalCents'] as int,
      shippingCents: j['shippingCents'] as int? ?? 0,
      totalCents: j['totalCents'] as int,
      shippingText: shipping == null
          ? null
          : '${shipping['carrier']} · ${shipping['service']} · até ${shipping['deliveryDays']} dias úteis',
      addressText:
          '${a['street'] ?? ''}, ${a['number'] ?? ''} — ${a['neighborhood'] ?? ''}, ${a['city'] ?? ''}/${a['state'] ?? ''}',
      createdAt: DateTime.parse(j['createdAt'] as String),
      items: [
        for (final i in (j['items'] as List<dynamic>)) OrderItem.fromJson(i as Map<String, dynamic>),
      ],
    );
  }
}

// ---------------- repositório ----------------

class OrdersRepository {
  OrdersRepository(this._api);
  final ApiClient _api;

  Future<List<OrderSummary>> list() async {
    final response = await _api.dio.get('/me/orders', queryParameters: {'pageSize': 50});
    final data = response.data as Map<String, dynamic>;
    return (data['items'] as List<dynamic>)
        .map((e) => OrderSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<OrderDetail> detail(String id) async {
    final response = await _api.dio.get('/me/orders/$id');
    return OrderDetail.fromJson(response.data as Map<String, dynamic>);
  }

  String mapError(Object e) => _api.extractError(e);
}

final ordersRepositoryProvider = Provider((ref) {
  return OrdersRepository(ref.watch(apiClientProvider));
});

// ---------------- telas ----------------

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  List<OrderSummary>? _orders;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(ordersRepositoryProvider);
    try {
      final orders = await repo.list();
      if (mounted) setState(() => _orders = orders);
    } catch (e) {
      if (mounted) setState(() => _error = repo.mapError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final orders = _orders;
    return Scaffold(
      appBar: AppBar(title: const Text('Meus pedidos')),
      body: orders == null
          ? Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator())
          : orders.isEmpty
              ? const Center(child: Text('Você ainda não fez pedidos.'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    itemCount: orders.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final o = orders[i];
                      return ListTile(
                        title: Text('Pedido #${o.number}'),
                        subtitle: Text(
                          '${formatDate(o.createdAt)} · ${o.itemsCount} '
                          '${o.itemsCount == 1 ? 'item' : 'itens'} · '
                          '${orderStatusLabels[o.status] ?? o.status}',
                        ),
                        trailing: Text(formatBrl(o.totalCents)),
                        onTap: () async {
                          await Navigator.of(context).pushNamed('/order', arguments: o.id);
                          _load();
                        },
                      );
                    },
                  ),
                ),
    );
  }
}

class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  OrderDetail? _order;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(ordersRepositoryProvider);
    try {
      final order = await repo.detail(widget.orderId);
      if (mounted) setState(() => _order = order);
    } catch (e) {
      if (mounted) setState(() => _error = repo.mapError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _order;
    final theme = Theme.of(context);
    if (o == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Pedido')),
        body: Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator()),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text('Pedido #${o.number}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            '${orderStatusLabels[o.status] ?? o.status} · ${formatDate(o.createdAt)}',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text('Entrega: ${o.addressText}', style: theme.textTheme.bodySmall),
          if (o.shippingText != null)
            Text(o.shippingText!, style: theme.textTheme.bodySmall),
          const Divider(height: 28),
          for (final item in o.items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      width: 56,
                      height: 56,
                      color: const Color(0xFFEEF1F5),
                      child: mediaUrl(item.imageUrl) == null
                          ? null
                          : Image.network(mediaUrl(item.imageUrl)!, fit: BoxFit.cover),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        InkWell(
                          onTap: () => Navigator.of(context)
                              .pushNamed('/product', arguments: item.productId),
                          child: Text('${item.quantity}× ${item.productName}'),
                        ),
                        if (item.variantLabel != null)
                          Text(item.variantLabel!, style: theme.textTheme.bodySmall),
                        Text(formatBrl(item.subtotalCents), style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                  if (item.canReview)
                    TextButton(
                      onPressed: () async {
                        final sent = await Navigator.of(context).push<bool>(
                          MaterialPageRoute(
                            builder: (_) => ReviewFormScreen(
                              productId: item.productId,
                              productName: item.productName,
                            ),
                          ),
                        );
                        if (sent == true) _load();
                      },
                      child: const Text('Avaliar'),
                    )
                  else if (item.reviewed)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Text('Avaliado', style: TextStyle(color: Colors.black45)),
                    ),
                ],
              ),
            ),
          const Divider(height: 28),
          _row(context, 'Subtotal', formatBrl(o.subtotalCents)),
          _row(context, 'Frete', o.shippingText == null ? 'a combinar' : formatBrl(o.shippingCents)),
          _row(context, 'Total', formatBrl(o.totalCents), bold: true),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value, {bool bold = false}) {
    final style = bold
        ? Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)
        : Theme.of(context).textTheme.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [Text(label, style: style), const Spacer(), Text(value, style: style)]),
    );
  }
}
