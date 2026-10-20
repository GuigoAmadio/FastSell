import 'package:flutter/material.dart';

const starColor = Color(0xFFE0A400);

class RatingStars extends StatelessWidget {
  const RatingStars({super.key, required this.value, this.size = 16});

  final double value;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          Icon(
            value >= i
                ? Icons.star_rounded
                : value >= i - 0.5
                    ? Icons.star_half_rounded
                    : Icons.star_outline_rounded,
            size: size,
            color: starColor,
          ),
      ],
    );
  }
}
