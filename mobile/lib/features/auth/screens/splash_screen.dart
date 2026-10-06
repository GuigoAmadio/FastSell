import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth_controller.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  Timer? _timeout;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _goIfReady());
    // Se o storage/biometria travar, força a tela de login.
    _timeout = Timer(const Duration(seconds: 4), () {
      if (!mounted) return;
      final status = ref.read(authControllerProvider).status;
      if (status == AuthStatus.unknown || status == AuthStatus.unauthenticated) {
        context.go('/login');
      }
    });
  }

  @override
  void dispose() {
    _timeout?.cancel();
    super.dispose();
  }

  void _goIfReady() {
    if (!mounted) return;
    final status = ref.read(authControllerProvider).status;
    if (status == AuthStatus.authenticated) {
      _timeout?.cancel();
      context.go('/home');
    } else if (status == AuthStatus.unauthenticated) {
      _timeout?.cancel();
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated) {
        _timeout?.cancel();
        context.go('/home');
      } else if (next.status == AuthStatus.unauthenticated) {
        _timeout?.cancel();
        context.go('/login');
      }
    });

    final status = ref.watch(authControllerProvider.select((s) => s.status));
    if (status == AuthStatus.authenticated ||
        status == AuthStatus.unauthenticated) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _goIfReady());
    }

    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.storefront, size: 72, color: Color(0xFF1A73E8)),
            SizedBox(height: 16),
            Text(
              'FastSell',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 24),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
