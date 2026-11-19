import 'package:material_ui/material_ui.dart';

import '../models/app_models.dart';
import '../services/app_storage.dart';
import '../widgets/app_widgets.dart';

class SavedInformationScreen extends StatefulWidget {
  const SavedInformationScreen({required this.storage, super.key});

  final AppStorage storage;

  @override
  State<SavedInformationScreen> createState() => _SavedInformationScreenState();
}

class _SavedInformationScreenState extends State<SavedInformationScreen> {
  List<SavedItem> _items = [];
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
      final items = await widget.storage.readSavedItems();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not read saved information: $error';
        _loading = false;
      });
    }
  }

  Future<void> _remove(SavedItem item) async {
    try {
      await widget.storage.removeItem(item.id);
      if (!mounted) return;
      setState(() => _items.removeWhere((saved) => saved.id == item.id));
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _error = 'Could not remove saved information: $error');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Saved information'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: ErrorPanel(message: _error!, onRetry: _load),
            )
          : _items.isEmpty
          ? const EmptyPanel(
              icon: Icons.bookmark_border,
              message: 'No saved items yet. Save a route or an emergency facility to keep it on this device.',
            )
          : ListView(
              padding: const EdgeInsets.all(14),
              children: [
                const DemoDataNotice(
                  text: 'Items are stored on this device and may become outdated. Confirm facility details before relying on them.',
                ),
                const SizedBox(height: 8),
                ..._items.map(
                  (item) => Card(
                    child: ExpansionTile(
                      leading: Icon(
                        item.type == 'route'
                            ? Icons.alt_route
                            : Icons.bookmark_outline,
                      ),
                      title: Text(item.title),
                      subtitle: Text(
                        '${item.type} · Saved ${formatTimestamp(item.savedAt)}',
                      ),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: SelectableText(item.details)),
                              IconButton(
                                tooltip: 'Remove saved item',
                                onPressed: () => _remove(item),
                                icon: const Icon(Icons.delete_outline),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
