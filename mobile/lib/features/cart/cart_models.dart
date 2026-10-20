class CartItem {
  CartItem({
    required this.id,
    required this.variantId,
    required this.productId,
    required this.productName,
    required this.variantLabel,
    required this.imageUrl,
    required this.unitPriceCents,
    required this.quantity,
    required this.availableStock,
    required this.maxQuantity,
    required this.issue,
  });

  final String id;
  final String variantId;
  final String productId;
  final String productName;
  final String? variantLabel;
  final String? imageUrl;
  final int unitPriceCents;
  final int quantity;
  final int availableStock;
  final int maxQuantity;

  /// null | UNAVAILABLE | OUT_OF_STOCK | INSUFFICIENT_STOCK
  final String? issue;

  /// Subtotal calculado no app (US14): atualiza na hora, sem esperar a API.
  int get subtotalCents => unitPriceCents * quantity;

  bool get exceedsStock => quantity > availableStock;

  CartItem copyWith({int? quantity, int? availableStock, String? issue, bool clearIssue = false}) {
    return CartItem(
      id: id,
      variantId: variantId,
      productId: productId,
      productName: productName,
      variantLabel: variantLabel,
      imageUrl: imageUrl,
      unitPriceCents: unitPriceCents,
      quantity: quantity ?? this.quantity,
      availableStock: availableStock ?? this.availableStock,
      maxQuantity: maxQuantity,
      issue: clearIssue ? null : (issue ?? this.issue),
    );
  }

  factory CartItem.fromJson(Map<String, dynamic> json) => CartItem(
        id: json['id'] as String,
        variantId: json['variantId'] as String,
        productId: json['productId'] as String,
        productName: json['productName'] as String,
        variantLabel: json['variantLabel'] as String?,
        imageUrl: json['imageUrl'] as String?,
        unitPriceCents: json['unitPriceCents'] as int,
        quantity: json['quantity'] as int,
        availableStock: json['availableStock'] as int? ?? 0,
        maxQuantity: json['maxQuantity'] as int? ?? 99,
        issue: json['issue'] as String?,
      );
}

class ShippingOption {
  ShippingOption({
    required this.serviceId,
    required this.carrier,
    required this.service,
    required this.priceCents,
    required this.deliveryDays,
    required this.tags,
  });

  final String serviceId;
  final String carrier;
  final String service;
  final int priceCents;

  /// Prazo em dias úteis informado pela transportadora.
  final int deliveryDays;
  final List<String> tags;

  bool get isEconomic => tags.contains('economic');
  bool get isExpress => tags.contains('express');

  factory ShippingOption.fromJson(Map<String, dynamic> json) => ShippingOption(
        serviceId: json['serviceId'] as String,
        carrier: json['carrier'] as String,
        service: json['service'] as String,
        priceCents: json['priceCents'] as int,
        deliveryDays: json['deliveryDays'] as int,
        tags: (json['tags'] as List<dynamic>? ?? const []).cast<String>(),
      );
}

/// Erro de API com código de negócio (ex.: INSUFFICIENT_STOCK) e estoque disponível.
class ApiProblem {
  ApiProblem({required this.message, this.code, this.available});
  final String message;
  final String? code;
  final int? available;
}
