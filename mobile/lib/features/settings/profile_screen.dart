import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/config.dart';
import '../../core/input_masks.dart';
import '../../core/validators.dart';
import '../auth/auth_controller.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _cpf = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  late String _initialName;
  late String _initialPhone;
  late String _initialCpf;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authControllerProvider).user;
    _name.text = user?.name ?? '';
    _phone.text = formatPhone(user?.phone ?? '');
    _cpf.text = formatCpf(user?.cpf ?? '');
    _initialName = _name.text.trim();
    _initialPhone = onlyDigits(_phone.text);
    _initialCpf = onlyDigits(_cpf.text);
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _cpf.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1200,
      imageQuality: 85,
    );
    if (file == null) return;
    try {
      await ref.read(authControllerProvider.notifier).uploadPhoto(file);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Foto atualizada')),
        );
      }
    } catch (_) {}
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final name = _name.text.trim();
    final phone = onlyDigits(_phone.text);
    final cpf = onlyDigits(_cpf.text);
    // Só envia o que mudou: os demais dados do perfil ficam como estão.
    // Campo apagado vai como "" e a API remove o dado.
    try {
      await ref.read(authControllerProvider.notifier).updateProfile(
            name: name != _initialName ? name : null,
            phone: phone != _initialPhone ? phone : null,
            cpf: cpf != _initialCpf ? cpf : null,
          );
      _initialName = name;
      _initialPhone = phone;
      _initialCpf = cpf;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Perfil salvo')),
        );
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.user;
    final photo = user?.photoUrl;
    final photoUrl = photo == null
        ? null
        : photo.startsWith('http')
            ? photo
            : '${ApiConfig.baseUrl}$photo';

    return Scaffold(
      appBar: AppBar(title: const Text('Perfil')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              GestureDetector(
                onTap: auth.loading ? null : _pickPhoto,
                child: CircleAvatar(
                  radius: 48,
                  backgroundImage:
                      photoUrl != null ? NetworkImage(photoUrl) : null,
                  child: photoUrl == null
                      ? const Icon(Icons.camera_alt, size: 32)
                      : null,
                ),
              ),
              const SizedBox(height: 8),
              const Text('Toque para alterar foto (PNG/JPG até 5MB)'),
              const SizedBox(height: 24),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Nome'),
                validator: (v) =>
                    v == null || v.trim().length < 2 ? 'Nome inválido' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                inputFormatters: [MaskFormatter(formatPhone)],
                decoration: const InputDecoration(
                  labelText: 'Telefone (opcional)',
                  hintText: '(11) 98765-4321',
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return null;
                  return isValidBrPhone(v) ? null : 'Telefone inválido: DDD + número';
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _cpf,
                keyboardType: TextInputType.number,
                inputFormatters: [MaskFormatter(formatCpf)],
                decoration: const InputDecoration(
                  labelText: 'CPF (opcional, exigido para comprar)',
                  hintText: '000.000.000-00',
                ),
                // Máscara não é validação: aqui conferimos os dígitos verificadores.
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return null;
                  if (onlyDigits(v).length != 11) return 'CPF deve ter 11 dígitos';
                  return isValidCpf(v) ? null : 'CPF inválido';
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                initialValue: user?.email ?? '',
                enabled: false,
                decoration: const InputDecoration(labelText: 'E-mail'),
              ),
              if (auth.error != null) ...[
                const SizedBox(height: 12),
                Text(auth.error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: auth.loading ? null : _save,
                child: auth.loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Salvar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
