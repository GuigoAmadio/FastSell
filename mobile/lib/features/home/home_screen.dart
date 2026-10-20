import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';
import '../cart/cart_controller.dart';
import '../cart/cart_screen.dart';
import '../catalog/catalog_screen.dart';
import '../favorites/favorites_screen.dart';

/// Área logada: Loja, Favoritos, Carrinho e Conta.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final cartCount = ref.watch(cartControllerProvider.select((c) => c.itemsCount));

    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: const [
          CatalogScreen(),
          FavoritesScreen(),
          CartScreen(),
          _AccountTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          // Carrinho sempre com estoque/preço atualizados ao abrir a aba.
          if (i == 2) ref.read(cartControllerProvider.notifier).load();
        },
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.storefront_outlined),
            selectedIcon: Icon(Icons.storefront),
            label: 'Loja',
          ),
          const NavigationDestination(
            icon: Icon(Icons.favorite_border),
            selectedIcon: Icon(Icons.favorite),
            label: 'Favoritos',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: cartCount > 0,
              label: Text('$cartCount'),
              child: const Icon(Icons.shopping_bag_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: cartCount > 0,
              label: Text('$cartCount'),
              child: const Icon(Icons.shopping_bag),
            ),
            label: 'Carrinho',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Conta',
          ),
        ],
      ),
    );
  }
}

/// Conteúdo da antiga Home (sprints 1 e 2) + pedidos, notificações e exclusão.
class _AccountTab extends ConsumerWidget {
  const _AccountTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.user;

    Widget item(IconData icon, String title, String subtitle, String route) => Card(
          child: ListTile(
            leading: Icon(icon),
            title: Text(title),
            subtitle: Text(subtitle),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).pushNamed(route),
          ),
        );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Conta'),
        actions: [
          IconButton(
            tooltip: 'Sair',
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authControllerProvider.notifier).logout();
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Olá, ${user?.name ?? user?.email ?? 'cliente'}',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 16),
          if (user?.isAdmin == true)
            item(
              Icons.inventory_2_outlined,
              'Painel administrativo',
              'Produtos, variações, estoque, fotos, categorias e marcas',
              '/admin',
            ),
          item(Icons.receipt_long_outlined, 'Meus pedidos', 'Histórico e avaliações', '/orders'),
          item(Icons.person_outline, 'Perfil', 'Nome, telefone, CPF e foto', '/profile'),
          item(Icons.location_on_outlined, 'Endereços', 'ViaCEP e endereço padrão', '/addresses'),
          item(
            Icons.notifications_none,
            'Notificações',
            'Canais e categorias que você quer receber',
            '/notifications',
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.verified_user),
              title: const Text('Segurança'),
              subtitle: Text(
                [
                  if (user?.twoFactorEnabled == true) '2FA ativo',
                  if (user?.biometricEnabled == true) 'Biometria ativa',
                  if (user?.twoFactorEnabled != true && user?.biometricEnabled != true)
                    'Configure biometria e 2FA',
                ].join(' · '),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).pushNamed('/settings'),
            ),
          ),
          item(Icons.devices, 'Sessões', 'Dispositivos conectados', '/sessions'),
        ],
      ),
    );
  }
}
