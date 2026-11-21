import 'package:material_ui/material_ui.dart';

import '../l10n/generated/app_localizations.dart';

const supportedLanguageCodes = ['en', 'hi', 'mr', 'gu', 'ta', 'te'];

String languageName(AppLocalizations localizations, String code) =>
    switch (code) {
      'hi' => localizations.hindi,
      'mr' => localizations.marathi,
      'gu' => localizations.gujarati,
      'ta' => localizations.tamil,
      'te' => localizations.telugu,
      _ => localizations.english,
    };

class LanguageSelector extends StatelessWidget {
  const LanguageSelector({
    required this.value,
    required this.onChanged,
    this.compact = false,
    super.key,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DropdownButtonFormField<String>(
      key: ValueKey('language-selector-$value'),
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: l10n.language,
        prefixIcon: const Icon(Icons.language),
        border: const OutlineInputBorder(),
        contentPadding: compact
            ? const EdgeInsets.symmetric(horizontal: 12, vertical: 10)
            : null,
      ),
      items: [
        for (final code in supportedLanguageCodes)
          DropdownMenuItem(
            value: code,
            child: Text(
              languageName(l10n, code),
              overflow: TextOverflow.ellipsis,
            ),
          ),
      ],
      onChanged: (code) {
        if (code != null && code != value) onChanged(code);
      },
    );
  }
}
