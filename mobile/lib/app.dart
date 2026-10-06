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
import 'core/theme.dart';

class FastSellApp extends ConsumerWidget {
  const FastSellApp({super.key});

  static final navigatorKey = GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

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
        switch (settings.name) {
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
          default:
            return null;
        }
      },
    );
  }
}
