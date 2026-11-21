import 'package:material_ui/material_ui.dart';

import '../models/app_models.dart';
import '../l10n/generated/app_localizations.dart';
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
      final l10n = AppLocalizations.of(context);
      setState(() {
        _error = l10n.readSavedError(error.toString());
        _loading = false;
      });
    }
  }

  Future<void> _remove(SavedItem item) async {
    final l10n = AppLocalizations.of(context);
    try {
      await widget.storage.removeItem(item.id);
      if (!mounted) return;
      setState(() => _items.removeWhere((saved) => saved.id == item.id));
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _error = l10n.removeSavedError(error.toString()));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.savedInformation),
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
          ? EmptyPanel(icon: Icons.bookmark_border, message: l10n.noSavedItems)
          : ListView(
              padding: const EdgeInsets.all(14),
              children: [
                DemoDataNotice(text: l10n.savedItemsNotice),
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
                        l10n.savedRecordSubtitle(
                          item.type == 'route' ? l10n.route : item.type,
                          formatTimestamp(
                            item.savedAt,
                            unavailable: l10n.updateTimeNotProvided,
                          ),
                        ),
                      ),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: SelectableText(item.details)),
                              IconButton(
                                tooltip: l10n.removeSavedItem,
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
