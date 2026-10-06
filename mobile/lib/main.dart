import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'features/auth/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: _DeepLinkBootstrap(child: FastSellApp())));
}

class _DeepLinkBootstrap extends ConsumerStatefulWidget {
  const _DeepLinkBootstrap({required this.child});
  final Widget child;

  @override
  ConsumerState<_DeepLinkBootstrap> createState() => _DeepLinkBootstrapState();
}

class _DeepLinkBootstrapState extends ConsumerState<_DeepLinkBootstrap> {
  late final AppLinks _appLinks;

  @override
  void initState() {
    super.initState();
    _appLinks = AppLinks();
    _initLinks();
  }

  Future<void> _initLinks() async {
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) _handleUri(initial);
    } catch (_) {}
    _appLinks.uriLinkStream.listen(_handleUri, onError: (_) {});
  }

  void _handleUri(Uri uri) {
    // fastsell://reset-password?token=...
    // https://.../reset-password?token=...
    final isReset = uri.host == 'reset-password' ||
        uri.path.contains('reset-password') ||
        uri.pathSegments.contains('reset-password');
    if (!isReset) return;
    final token = uri.queryParameters['token'];
    if (token == null || token.isEmpty) return;

    ref.read(authControllerProvider.notifier).setPendingResetToken(token);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      FastSellApp.navigatorKey.currentState?.pushNamed(
        '/reset-password',
        arguments: token,
      );
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
