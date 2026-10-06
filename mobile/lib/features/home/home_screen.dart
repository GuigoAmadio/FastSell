import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('FastSell'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => Navigator.of(context).pushNamed('/settings'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authControllerProvider.notifier).logout();
            },
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Olá, ${user?.name ?? user?.email ?? 'cliente'}',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Área logada pronta. A comunicação com o dispositivo ESP32 virá em um próximo sprint.',
            ),
            const SizedBox(height: 24),
            Card(
              child: ListTile(
                leading: const Icon(Icons.verified_user),
                title: const Text('Segurança'),
                subtitle: Text(
                  [
                    if (user?.twoFactorEnabled == true) '2FA ativo',
                    if (user?.biometricEnabled == true) 'Biometria ativa',
                    if (user?.twoFactorEnabled != true &&
                        user?.biometricEnabled != true)
                      'Configure biometria e 2FA nas configurações',
                  ].join(' · '),
                ),
                onTap: () => Navigator.of(context).pushNamed('/settings'),
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.person_outline),
                title: const Text('Perfil'),
                subtitle: const Text('Nome, telefone, CPF e foto'),
                onTap: () => Navigator.of(context).pushNamed('/profile'),
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.location_on_outlined),
                title: const Text('Endereços'),
                subtitle: const Text('ViaCEP e endereço padrão'),
                onTap: () => Navigator.of(context).pushNamed('/addresses'),
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.devices),
                title: const Text('Sessões'),
                subtitle: const Text('Dispositivos conectados'),
                onTap: () => Navigator.of(context).pushNamed('/sessions'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
