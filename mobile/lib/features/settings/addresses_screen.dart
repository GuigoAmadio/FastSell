import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';
import '../auth/models.dart';

class AddressesScreen extends ConsumerStatefulWidget {
  const AddressesScreen({super.key});

  @override
  ConsumerState<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends ConsumerState<AddressesScreen> {
  List<Address> _items = [];
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
      final list = await ref.read(authRepositoryProvider).listAddresses();
      if (mounted) setState(() => _items = list);
    } catch (e) {
      if (mounted) {
        setState(() => _error = ref.read(authRepositoryProvider).mapError(e));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openForm({Address? existing}) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddressFormSheet(existing: existing),
    );
    if (saved == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Endereços')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _openForm(),
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _items.isEmpty
                  ? const Center(child: Text('Nenhum endereço cadastrado'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: _items.length,
                        itemBuilder: (context, i) {
                          final a = _items[i];
                          return ListTile(
                            leading: Icon(
                              a.isDefault ? Icons.home : Icons.location_on_outlined,
                              color: a.isDefault ? Colors.blue : null,
                            ),
                            title: Text(a.label?.isNotEmpty == true ? a.label! : 'Endereço'),
                            subtitle: Text(a.summary),
                            trailing: PopupMenuButton<String>(
                              onSelected: (value) async {
                                final repo = ref.read(authRepositoryProvider);
                                if (value == 'default') {
                                  await repo.setDefaultAddress(a.id);
                                } else if (value == 'edit') {
                                  await _openForm(existing: a);
                                  return;
                                } else if (value == 'delete') {
                                  await repo.deleteAddress(a.id);
                                }
                                await _load();
                              },
                              itemBuilder: (_) => [
                                if (!a.isDefault)
                                  const PopupMenuItem(
                                    value: 'default',
                                    child: Text('Definir como padrão'),
                                  ),
                                const PopupMenuItem(value: 'edit', child: Text('Editar')),
                                const PopupMenuItem(value: 'delete', child: Text('Excluir')),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}

class _AddressFormSheet extends ConsumerStatefulWidget {
  const _AddressFormSheet({this.existing});
  final Address? existing;

  @override
  ConsumerState<_AddressFormSheet> createState() => _AddressFormSheetState();
}

class _AddressFormSheetState extends ConsumerState<_AddressFormSheet> {
  final _cep = TextEditingController();
  final _street = TextEditingController();
  final _number = TextEditingController();
  final _complement = TextEditingController();
  final _neighborhood = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _label = TextEditingController();
  bool _default = false;
  bool _loadingCep = false;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _cep.text = e.cep;
      _street.text = e.street;
      _number.text = e.number;
      _complement.text = e.complement ?? '';
      _neighborhood.text = e.neighborhood;
      _city.text = e.city;
      _state.text = e.state;
      _label.text = e.label ?? '';
      _default = e.isDefault;
    }
  }

  @override
  void dispose() {
    _cep.dispose();
    _street.dispose();
    _number.dispose();
    _complement.dispose();
    _neighborhood.dispose();
    _city.dispose();
    _state.dispose();
    _label.dispose();
    super.dispose();
  }

  Future<void> _lookupCep() async {
    final cep = _cep.text.replaceAll(RegExp(r'\D'), '');
    if (cep.length != 8) return;
    setState(() {
      _loadingCep = true;
      _error = null;
    });
    try {
      final dio = Dio();
      final res = await dio.get('https://viacep.com.br/ws/$cep/json/');
      final data = res.data as Map<String, dynamic>;
      if (data['erro'] == true) {
        setState(() => _error = 'CEP não encontrado');
        return;
      }
      _street.text = (data['logradouro'] as String?) ?? '';
      _neighborhood.text = (data['bairro'] as String?) ?? '';
      _city.text = (data['localidade'] as String?) ?? '';
      _state.text = (data['uf'] as String?) ?? '';
    } catch (_) {
      setState(() => _error = 'Falha ao consultar ViaCEP');
    } finally {
      if (mounted) setState(() => _loadingCep = false);
    }
  }

  Future<void> _save() async {
    final cep = _cep.text.replaceAll(RegExp(r'\D'), '');
    if (cep.length != 8 ||
        _street.text.isEmpty ||
        _number.text.isEmpty ||
        _neighborhood.text.isEmpty ||
        _city.text.isEmpty ||
        _state.text.length != 2) {
      setState(() => _error = 'Preencha CEP, rua, número, bairro, cidade e UF');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final payload = {
      'label': _label.text.trim().isEmpty ? null : _label.text.trim(),
      'cep': cep,
      'street': _street.text.trim(),
      'number': _number.text.trim(),
      'complement':
          _complement.text.trim().isEmpty ? null : _complement.text.trim(),
      'neighborhood': _neighborhood.text.trim(),
      'city': _city.text.trim(),
      'state': _state.text.trim().toUpperCase(),
      'isDefault': _default,
    };
    try {
      final repo = ref.read(authRepositoryProvider);
      if (widget.existing == null) {
        await repo.createAddress(payload);
      } else {
        await repo.updateAddress(widget.existing!.id, payload);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() => _error = repoSafeError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String repoSafeError(Object e) {
    try {
      return ref.read(authRepositoryProvider).mapError(e);
    } catch (_) {
      return e.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              widget.existing == null ? 'Novo endereço' : 'Editar endereço',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _label,
              decoration: const InputDecoration(labelText: 'Apelido (Casa, Trabalho…)'),
            ),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _cep,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'CEP'),
                    onChanged: (v) {
                      if (v.replaceAll(RegExp(r'\D'), '').length == 8) {
                        _lookupCep();
                      }
                    },
                  ),
                ),
                const SizedBox(width: 8),
                if (_loadingCep)
                  const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  IconButton(
                    onPressed: _lookupCep,
                    icon: const Icon(Icons.search),
                  ),
              ],
            ),
            TextField(controller: _street, decoration: const InputDecoration(labelText: 'Rua')),
            TextField(controller: _number, decoration: const InputDecoration(labelText: 'Número')),
            TextField(
              controller: _complement,
              decoration: const InputDecoration(labelText: 'Complemento'),
            ),
            TextField(
              controller: _neighborhood,
              decoration: const InputDecoration(labelText: 'Bairro'),
            ),
            TextField(controller: _city, decoration: const InputDecoration(labelText: 'Cidade')),
            TextField(
              controller: _state,
              maxLength: 2,
              decoration: const InputDecoration(labelText: 'UF', counterText: ''),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Endereço padrão'),
              value: _default,
              onChanged: (v) => setState(() => _default = v),
            ),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: _saving
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
    );
  }
}
