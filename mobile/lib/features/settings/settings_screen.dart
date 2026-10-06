import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';
import '../auth/screens/setup_2fa_sheet.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool? _deviceSupportsBiometrics;

  @override
  void initState() {
    super.initState();
    _loadCapability();
  }

  Future<void> _loadCapability() async {
    final available = await ref.read(biometricServiceProvider).isAvailable();
    if (mounted) setState(() => _deviceSupportsBiometrics = available);
  }

  Future<void> _open2faSetup() async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const Setup2faSheet(),
    );
    if (ok == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('2FA ativado com sucesso')),
      );
    }
  }

  Future<void> _disable2fa() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Desativar 2FA?'),
        content: const Text('Sua conta ficará apenas com senha (e biometria local).'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Desativar')),
        ],
      ),
    );
    if (confirm == true) {
      await ref.read(authControllerProvider.notifier).disable2fa();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final enabled = auth.user?.biometricEnabled ?? false;
    final supports = _deviceSupportsBiometrics;
    final twoFa = auth.user?.twoFactorEnabled == true;

    return Scaffold(
      appBar: AppBar(title: const Text('Configurações')),
      body: ListView(
        children: [
          SwitchListTile(
            title: const Text('Login biométrico'),
            subtitle: Text(
              supports == false
                  ? 'Este aparelho não tem Face ID / digital'
                  : 'Use Face ID ou impressão digital para entrar. Em falha, use senha.',
            ),
            value: enabled,
            onChanged: supports == true
                ? (value) => ref
                    .read(authControllerProvider.notifier)
                    .setBiometricEnabled(value)
                : null,
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.security),
            title: const Text('Autenticação em dois fatores'),
            subtitle: Text(
              twoFa
                  ? 'Ativo (${auth.user?.twoFactorMethod ?? ''})'
                  : 'Desativado — OTP por SMS ou app autenticador',
            ),
            trailing: twoFa
                ? TextButton(onPressed: _disable2fa, child: const Text('Desativar'))
                : TextButton(onPressed: _open2faSetup, child: const Text('Ativar')),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: const Text('Editar perfil'),
            onTap: () => Navigator.of(context).pushNamed('/profile'),
          ),
          ListTile(
            leading: const Icon(Icons.location_on_outlined),
            title: const Text('Endereços'),
            onTap: () => Navigator.of(context).pushNamed('/addresses'),
          ),
          ListTile(
            leading: const Icon(Icons.devices),
            title: const Text('Sessões ativas'),
            onTap: () => Navigator.of(context).pushNamed('/sessions'),
          ),
          if (auth.error != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(auth.error!, style: const TextStyle(color: Colors.red)),
            ),
        ],
      ),
    );
  }
}
