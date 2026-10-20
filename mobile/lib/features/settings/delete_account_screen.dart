import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';

/// US09 — exclusão de conta em duas etapas:
/// 1) confirma a senha; 2) confirmação final digitando EXCLUIR.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _password = TextEditingController();
  final _confirmWord = TextEditingController();
  String? _token;
  int _ordersKept = 0;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _confirmWord.dispose();
    super.dispose();
  }

  Future<void> _stepOne() async {
    final api = ref.read(apiClientProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response = await api.dio.post(
        '/me/account/deletion-request',
        data: {'password': _password.text},
      );
      final data = response.data as Map<String, dynamic>;
      setState(() {
        _token = data['confirmationToken'] as String;
        _ordersKept = data['ordersKept'] as int? ?? 0;
      });
    } catch (e) {
      setState(() => _error = api.extractError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _stepTwo() async {
    final api = ref.read(apiClientProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await api.dio.post(
        '/me/account/deletion-confirm',
        data: {'confirmationToken': _token},
      );
      await ref.read(secureStorageProvider).clearAll();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Conta excluída. Enviamos a confirmação por e-mail.')),
      );
      Navigator.of(context).popUntil((r) => r.isFirst);
      await ref.read(authControllerProvider.notifier).logout();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = api.extractError(e);
          _token = null; // confirmação expirou: recomeça pela senha
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final step2 = _token != null;
    return Scaffold(
      appBar: AppBar(title: const Text('Excluir conta')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            step2 ? 'Etapa 2 de 2 · Confirmação final' : 'Etapa 1 de 2 · Confirme sua senha',
            style: theme.textTheme.labelLarge?.copyWith(color: Colors.black54),
          ),
          const SizedBox(height: 12),
          const Text(
            'Ao excluir a conta:\n'
            '• seus dados pessoais (nome, CPF, telefone, foto, endereços) são anonimizados;\n'
            '• favoritos, carrinho e sessões são apagados e você perde o acesso;\n'
            '• suas avaliações continuam publicadas como “Cliente”, sem fotos;\n'
            '• registros fiscais dos pedidos são mantidos pelo prazo exigido em lei.',
          ),
          const SizedBox(height: 20),
          if (!step2) ...[
            TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Senha atual'),
              onSubmitted: (_) => _stepOne(),
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: _busy ? null : _stepOne,
              child: const Text('Continuar'),
            ),
          ] else ...[
            if (_ordersKept > 0)
              Text(
                'Você tem $_ordersKept ${_ordersKept == 1 ? 'pedido' : 'pedidos'}: '
                'os dados fiscais deles serão preservados.',
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _confirmWord,
              decoration: const InputDecoration(labelText: 'Digite EXCLUIR para confirmar'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFB3261E),
                minimumSize: const Size.fromHeight(48),
              ),
              onPressed: _busy || _confirmWord.text.trim().toUpperCase() != 'EXCLUIR'
                  ? null
                  : _stepTwo,
              child: const Text('Excluir minha conta definitivamente'),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
        ],
      ),
    );
  }
}
