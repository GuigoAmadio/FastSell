import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';

/// US08 — checkboxes independentes para canais (E-mail, Push, SMS) e
/// categorias (Promoções, Pedidos). Cada toque salva só aquele campo.
class NotificationPreferencesScreen extends ConsumerStatefulWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  ConsumerState<NotificationPreferencesScreen> createState() =>
      _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState
    extends ConsumerState<NotificationPreferencesScreen> {
  Map<String, bool>? _prefs;
  Map<String, String> _channels = const {};
  final Set<String> _saving = {};
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _apply(Map<String, dynamic> data) {
    final prefs = data['preferences'] as Map<String, dynamic>;
    _prefs = prefs.map((k, v) => MapEntry(k, v as bool));
    _channels = (data['channels'] as Map<String, dynamic>? ?? const {})
        .map((k, v) => MapEntry(k, v.toString()));
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    try {
      final response = await api.dio.get('/me/notification-preferences');
      if (mounted) setState(() => _apply(response.data as Map<String, dynamic>));
    } catch (e) {
      if (mounted) setState(() => _error = api.extractError(e));
    }
  }

  Future<void> _toggle(String key, bool value) async {
    final api = ref.read(apiClientProvider);
    setState(() {
      _prefs = {..._prefs!, key: value}; // reflete na hora
      _saving.add(key);
      _error = null;
    });
    try {
      final response = await api.dio.patch(
        '/me/notification-preferences',
        data: {key: value},
      );
      if (mounted) setState(() => _apply(response.data as Map<String, dynamic>));
    } catch (e) {
      if (mounted) {
        setState(() {
          _prefs = {..._prefs!, key: !value};
          _error = api.extractError(e);
        });
      }
    } finally {
      if (mounted) setState(() => _saving.remove(key));
    }
  }

  Widget _box(String key, String title, String subtitle, {String? note}) {
    final prefs = _prefs!;
    return CheckboxListTile(
      value: prefs[key] ?? false,
      onChanged: _saving.contains(key) ? null : (v) => _toggle(key, v ?? false),
      title: Text(title),
      subtitle: Text(note == null ? subtitle : '$subtitle\n$note'),
      isThreeLine: note != null,
      controlAffinity: ListTileControlAffinity.trailing,
    );
  }

  @override
  Widget build(BuildContext context) {
    final header = Theme.of(context).textTheme.titleSmall?.copyWith(color: Colors.black54);
    return Scaffold(
      appBar: AppBar(title: const Text('Notificações')),
      body: _prefs == null
          ? Center(child: _error != null ? Text(_error!) : const CircularProgressIndicator())
          : ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  child: Text('Canais', style: header),
                ),
                _box('emailEnabled', 'E-mail', 'Mensagens no seu e-mail cadastrado'),
                _box(
                  'pushEnabled',
                  'Push',
                  'Alertas no celular',
                  note: _channels['push'] == 'not_configured'
                      ? 'Ainda não disponível: chega com a integração de push (US23).'
                      : null,
                ),
                _box('smsEnabled', 'SMS', 'Mensagens no telefone do perfil'),
                const Divider(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  child: Text('Categorias', style: header),
                ),
                _box('ordersEnabled', 'Pedidos', 'Confirmação e andamento das suas compras'),
                _box('promotionsEnabled', 'Promoções', 'Ofertas e novidades da loja'),
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Uma mensagem só é enviada por um canal se o canal e a categoria '
                    'estiverem marcados. Alertas de segurança (bloqueio de conta, '
                    'redefinição de senha) sempre chegam por e-mail.',
                    style: TextStyle(color: Colors.black54),
                  ),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(_error!, style: const TextStyle(color: Colors.red)),
                  ),
              ],
            ),
    );
  }
}
