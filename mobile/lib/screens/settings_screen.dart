import 'package:material_ui/material_ui.dart';

import '../l10n/generated/app_localizations.dart';
import '../widgets/language_selector.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({
    required this.onLanguageChanged,
    required this.isSignedIn,
    required this.isGuest,
    required this.onSignOut,
    required this.onLogin,
    super.key,
  });

  final ValueChanged<String> onLanguageChanged;
  final bool isSignedIn;
  final bool isGuest;
  final Future<void> Function() onSignOut;
  final VoidCallback onLogin;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            l10n.currentLanguage,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          LanguageSelector(value: language, onChanged: onLanguageChanged),
          const SizedBox(height: 24),
          Text(
            l10n.accountSection,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            isGuest ? l10n.accountGuest : l10n.accountSignedIn,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 8),
          if (isSignedIn || isGuest)
            OutlinedButton.icon(
              key: const ValueKey('settings-sign-out'),
              onPressed: () async {
                await onSignOut();
                if (context.mounted) Navigator.of(context).pop();
              },
              icon: const Icon(Icons.logout),
              label: Text(isGuest ? l10n.signOutGuest : l10n.logout),
            )
          else
            OutlinedButton.icon(
              onPressed: onLogin,
              icon: const Icon(Icons.login),
              label: Text(l10n.login),
            ),
        ],
      ),
    );
  }
}
