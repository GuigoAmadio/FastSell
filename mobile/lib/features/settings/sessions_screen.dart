import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';
import '../auth/models.dart';

class SessionsScreen extends ConsumerStatefulWidget {
  const SessionsScreen({super.key});

  @override
  ConsumerState<SessionsScreen> createState() => _SessionsScreenState();
}

class _SessionsScreenState extends ConsumerState<SessionsScreen> {
  List<SessionInfo> _sessions = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await ref.read(authRepositoryProvider).listSessions();
      if (mounted) setState(() => _sessions = list);
    } catch (e) {
      if (mounted) {
        setState(() => _error = ref.read(authRepositoryProvider).mapError(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _revoke(String id) async {
    await ref.read(authRepositoryProvider).revokeSession(id);
    await _load();
  }

  Future<void> _revokeAll() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Desconectar todos?'),
        content: const Text(
          'Os outros dispositivos serão desconectados. Esta sessão permanece ativa.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Desconectar')),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(authRepositoryProvider).revokeAllSessions();
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sessões ativas'),
        actions: [
          TextButton(onPressed: _loading ? null : _revokeAll, child: const Text('Desconectar todos')),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    itemCount: _sessions.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final s = _sessions[i];
                      return ListTile(
                        leading: Icon(
                          s.isCurrent ? Icons.smartphone : Icons.devices_other,
                          color: s.isCurrent ? Colors.green : null,
                        ),
                        title: Text(s.deviceLabel ?? s.userAgent ?? 'Dispositivo'),
                        subtitle: Text(
                          [
                            if (s.ip != null) 'IP ${s.ip}',
                            if (s.isCurrent) 'Este aparelho',
                            'Criada ${s.createdAt.toLocal()}',
                          ].join(' · '),
                        ),
                        trailing: s.isCurrent
                            ? const Chip(label: Text('Atual'))
                            : IconButton(
                                icon: const Icon(Icons.logout),
                                onPressed: () => _revoke(s.id),
                              ),
                      );
                    },
                  ),
                ),
    );
  }
}
