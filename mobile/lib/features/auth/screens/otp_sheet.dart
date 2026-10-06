import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pinput/pinput.dart';
import '../auth_controller.dart';
import '../models.dart';

class OtpSheet extends ConsumerStatefulWidget {
  const OtpSheet({
    super.key,
    required this.challenge,
    required this.onCancel,
  });

  final TwoFactorChallenge challenge;
  final VoidCallback onCancel;

  @override
  ConsumerState<OtpSheet> createState() => _OtpSheetState();
}

class _OtpSheetState extends ConsumerState<OtpSheet> {
  late int _remaining;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _remaining = widget.challenge.expiresInSeconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_remaining <= 0) {
        setState(() {});
        return;
      }
      setState(() => _remaining--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final minutes = (_remaining ~/ 60).toString().padLeft(2, '0');
    final seconds = (_remaining % 60).toString().padLeft(2, '0');

    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated) {
        Navigator.of(context).pop();
      }
    });

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Autenticação em dois fatores',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            widget.challenge.method == 'SMS'
                ? 'Digite o código de 6 dígitos enviado por SMS'
                : 'Digite o código do autenticador',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            _remaining > 0 ? 'Expira em $minutes:$seconds' : 'Código expirado',
            style: TextStyle(
              color: _remaining > 0 ? Colors.black54 : Colors.red,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 20),
          Pinput(
            length: 6,
            enabled: !auth.loading && _remaining > 0,
            onCompleted: (code) {
              ref.read(authControllerProvider.notifier).verify2fa(code);
            },
          ),
          if (auth.error != null) ...[
            const SizedBox(height: 12),
            Text(auth.error!, style: const TextStyle(color: Colors.red)),
          ],
          if (auth.loading) ...[
            const SizedBox(height: 16),
            const CircularProgressIndicator(),
          ],
          const SizedBox(height: 16),
          TextButton(onPressed: widget.onCancel, child: const Text('Cancelar')),
        ],
      ),
    );
  }
}
