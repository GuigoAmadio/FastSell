import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pinput/pinput.dart';
import '../auth_controller.dart';
import '../models.dart';

class Setup2faSheet extends ConsumerStatefulWidget {
  const Setup2faSheet({super.key});

  @override
  ConsumerState<Setup2faSheet> createState() => _Setup2faSheetState();
}

class _Setup2faSheetState extends ConsumerState<Setup2faSheet> {
  TwoFactorSetup? _setup;
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _start(String method) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final setup = await ref.read(authControllerProvider.notifier).start2faSetup(
            method: method,
            phone: method == 'SMS' ? _phone.text.trim() : null,
          );
      setState(() => _setup = setup);
    } catch (e) {
      setState(() => _error = ref.read(authRepositoryProvider).mapError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirm() async {
    if (_code.text.length != 6) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).confirm2faSetup(_code.text);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _error = ref.read(authRepositoryProvider).mapError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Ativar autenticação em dois fatores',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            const Text(
              'Escolha App autenticador (TOTP) ou SMS. O código vale 5 minutos.',
            ),
            const SizedBox(height: 16),
            if (_error != null) ...[
              Text(_error!, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 8),
            ],
            if (_setup == null) ...[
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Telefone (obrigatório para SMS)',
                  hintText: '+5511999999999',
                ),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: _loading ? null : () => _start('TOTP'),
                child: const Text('Usar app autenticador'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _loading ? null : () => _start('SMS'),
                child: const Text('Usar SMS'),
              ),
            ] else ...[
              if (_setup!.method == 'TOTP') ...[
                if (_setup!.qrCodeDataUrl != null) ...[
                  Center(
                    child: Image.memory(
                      base64Decode(_setup!.qrCodeDataUrl!.split(',').last),
                      width: 180,
                      height: 180,
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                SelectableText(
                  'Secret: ${_setup!.secret ?? ''}',
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                ),
                TextButton.icon(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: _setup!.secret ?? ''));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Secret copiado')),
                    );
                  },
                  icon: const Icon(Icons.copy),
                  label: const Text('Copiar secret'),
                ),
              ] else
                const Text('Enviamos um código SMS. Digite abaixo para confirmar.'),
              const SizedBox(height: 12),
              Pinput(
                length: 6,
                controller: _code,
                onCompleted: (_) => _confirm(),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: _loading ? null : _confirm,
                child: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Confirmar e ativar'),
              ),
            ],
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar'),
            ),
          ],
        ),
      ),
    );
  }
}
