import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/screens/forgot_password_screen.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/auth/screens/register_screen.dart';
import 'features/auth/screens/reset_password_screen.dart';
import 'features/home/home_screen.dart';
import 'features/settings/addresses_screen.dart';
import 'features/settings/profile_screen.dart';
import 'features/settings/sessions_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/admin/admin_products_screen.dart';
import 'features/cart/cart_screen.dart';
import 'features/catalog/product_detail_screen.dart';
import 'features/orders/orders.dart';
import 'features/settings/delete_account_screen.dart';
import 'features/settings/notification_preferences_screen.dart';
import 'core/theme.dart';

class FastSellApp extends ConsumerWidget {
  const FastSellApp({super.key});

  static final navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    // Ao sair da conta (botão Sair, exclusão de conta ou sessão expirada),
    // limpa a pilha de telas e volta para a raiz, que agora é o login.
    // Sem isso, se houver telas empilhadas por cima, o usuário continua vendo o app.
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (prev?.status == AuthStatus.authenticated &&
          next.status == AuthStatus.unauthenticated) {
        navigatorKey.currentState?.pushNamedAndRemoveUntil('/', (_) => false);
      }
    });

    return MaterialApp(
      title: 'FastSell',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      themeMode: ThemeMode.light,
      navigatorKey: navigatorKey,
      home: auth.status == AuthStatus.authenticated
          ? const HomeScreen()
          : const LoginScreen(),
      onGenerateRoute: (settings) {
        // Na web a rota pode chegar com query (?token=...): separa caminho e parâmetros.
        final uri = Uri.tryParse(settings.name ?? '') ?? Uri();
        switch (uri.path) {
          case '/login':
            return MaterialPageRoute(builder: (_) => const LoginScreen());
          case '/register':
            return MaterialPageRoute(builder: (_) => const RegisterScreen());
          case '/forgot-password':
            return MaterialPageRoute(
              builder: (_) => const ForgotPasswordScreen(),
            );
          case '/reset-password':
            final token = (settings.arguments as String?) ??
                uri.queryParameters['token'] ??
                auth.pendingResetToken ??
                '';
            return MaterialPageRoute(
              builder: (_) => ResetPasswordScreen(token: token),
            );
          case '/home':
            return MaterialPageRoute(builder: (_) => const HomeScreen());
          case '/settings':
            return MaterialPageRoute(builder: (_) => const SettingsScreen());
          case '/profile':
            return MaterialPageRoute(builder: (_) => const ProfileScreen());
          case '/sessions':
            return MaterialPageRoute(builder: (_) => const SessionsScreen());
          case '/addresses':
            return MaterialPageRoute(builder: (_) => const AddressesScreen());
          case '/product':
            final productId = settings.arguments as String;
            return MaterialPageRoute(
              builder: (_) => ProductDetailScreen(productId: productId),
            );
          case '/cart':
            return MaterialPageRoute(builder: (_) => const CartScreen());
          case '/orders':
            return MaterialPageRoute(builder: (_) => const OrdersScreen());
          case '/order':
            final orderId = settings.arguments as String;
            return MaterialPageRoute(
              builder: (_) => OrderDetailScreen(orderId: orderId),
            );
          case '/notifications':
            return MaterialPageRoute(
              builder: (_) => const NotificationPreferencesScreen(),
            );
          case '/admin':
            return MaterialPageRoute(builder: (_) => const AdminProductsScreen());
          case '/delete-account':
            return MaterialPageRoute(builder: (_) => const DeleteAccountScreen());
          default:
            return null;
        }
      },
    );
  }
}
