import 'package:material_ui/material_ui.dart';

import '../app_text.dart';
import '../services/api_service.dart';
import '../widgets/app_widgets.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.api,
    required this.language,
    required this.onLanguageChanged,
    required this.onOpenFeature,
    required this.onOpenLogin,
    required this.onSignOut,
    required this.isSignedIn,
    super.key,
  });

  final ApiService api;
  final String language;
  final ValueChanged<String> onLanguageChanged;
  final ValueChanged<String> onOpenFeature;
  final VoidCallback onOpenLogin;
  final VoidCallback onSignOut;
  final bool isSignedIn;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _checkingConnection = true;
  bool? _backendReachable;
  String? _connectionError;

  @override
  void initState() {
    super.initState();
    _checkConnection();
  }

  Future<void> _checkConnection() async {
    setState(() {
      _checkingConnection = true;
      _connectionError = null;
    });
    try {
      await widget.api.checkHealth();
      if (!mounted) return;
      setState(() {
        _backendReachable = true;
        _checkingConnection = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _backendReachable = false;
        _connectionError = error.message;
        _checkingConnection = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    String t(String key) => AppText.text(widget.language, key);

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Image.asset(
          'assets/sankatsetu_logo.jpeg',
          key: const ValueKey('home-logo'),
          width: 128,
          height: 72,
          fit: BoxFit.contain,
          semanticLabel: 'SankatSetu logo',
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Language',
            icon: const Icon(Icons.language),
            onSelected: widget.onLanguageChanged,
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'en', child: Text('English')),
              PopupMenuItem(value: 'hi', child: Text('हिन्दी')),
              PopupMenuItem(value: 'mr', child: Text('मराठी')),
            ],
          ),
          IconButton(
            tooltip: widget.isSignedIn ? t('logout') : t('login'),
            onPressed: widget.isSignedIn
                ? widget.onSignOut
                : widget.onOpenLogin,
            icon: Icon(widget.isSignedIn ? Icons.logout : Icons.person_outline),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _checkConnection,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          children: [
            Text(
              t('welcome'),
              style: textTheme.titleMedium?.copyWith(
                color: sankatInk,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Pune, Maharashtra',
              style: textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.primaryContainer,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.water_drop_outlined, color: colors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Flood risk updates',
                          style: textTheme.titleMedium?.copyWith(
                            color: colors.onPrimaryContainer,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Live flood-risk monitoring is not available yet. '
                    'Check official alerts before travelling.',
                    style: textTheme.bodyMedium?.copyWith(
                      color: colors.onPrimaryContainer,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (_checkingConnection)
                        const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else
                        Icon(
                          _backendReachable == true
                              ? Icons.cloud_done_outlined
                              : Icons.cloud_off_outlined,
                          size: 20,
                          color: colors.onPrimaryContainer,
                        ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _checkingConnection
                              ? t('loading')
                              : _backendReachable == true
                              ? t('connected')
                              : t('offline'),
                          style: textTheme.bodySmall?.copyWith(
                            color: colors.onPrimaryContainer,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: _checkingConnection
                            ? null
                            : _checkConnection,
                        tooltip: t('retry'),
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(Icons.refresh),
                      ),
                    ],
                  ),
                  if (_connectionError != null)
                    Text(
                      _connectionError!,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.onPrimaryContainer,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            DemoDataNotice(text: t('demoData')),
            const SizedBox(height: 20),
            Text(
              'Emergency actions',
              style: textTheme.titleLarge?.copyWith(
                color: sankatInk,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 10),
            _DashboardAction(
              icon: Icons.emergency_outlined,
              title: t('emergency'),
              subtitle: 'Find emergency help and nearby facilities',
              color: const Color(0xFFB3261E),
              onTap: () => widget.onOpenFeature('emergency'),
            ),
            const SizedBox(height: 8),
            _DashboardAction(
              icon: Icons.alt_route,
              title: t('safeRoutes'),
              subtitle: 'Compare safer routes and avoid flooded roads',
              color: colors.primary,
              onTap: () => widget.onOpenFeature('routes'),
            ),
            const SizedBox(height: 8),
            _DashboardAction(
              icon: Icons.campaign_outlined,
              title: t('reports'),
              subtitle: 'Report waterlogging or blocked roads',
              color: const Color(0xFF8A4B08),
              onTap: () => widget.onOpenFeature('reports'),
            ),
            const SizedBox(height: 20),
            Text(
              'More tools',
              style: textTheme.titleLarge?.copyWith(
                color: sankatInk,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                _ToolChip(
                  icon: Icons.warning_amber_outlined,
                  label: t('alerts'),
                  onPressed: () => widget.onOpenFeature('alerts'),
                ),
                _ToolChip(
                  icon: Icons.map_outlined,
                  label: t('map'),
                  onPressed: () => widget.onOpenFeature('map'),
                ),
                _ToolChip(
                  icon: Icons.menu_book_outlined,
                  label: t('offlineGuide'),
                  onPressed: () => widget.onOpenFeature('guide'),
                ),
                _ToolChip(
                  icon: Icons.chat_bubble_outline,
                  label: t('assistant'),
                  onPressed: () => widget.onOpenFeature('assistant'),
                ),
                _ToolChip(
                  icon: Icons.bookmark_outline,
                  label: t('savedInfo'),
                  onPressed: () => widget.onOpenFeature('saved'),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Text(
              'Be prepared',
              style: textTheme.titleLarge?.copyWith(
                color: sankatInk,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Keep essential supplies and emergency contacts ready.',
              style: textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceVariant,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 12),
            if (!widget.isSignedIn)
              OutlinedButton.icon(
                onPressed: widget.onOpenLogin,
                icon: const Icon(Icons.lock_open),
                label: Text(t('login')),
              )
            else
              const Text(
                'Signed in as a citizen. Report submission uses your server-issued account token.',
                style: TextStyle(color: Colors.black54, fontSize: 12),
              ),
          ],
        ),
      ),
    );
  }
}

class _DashboardAction extends StatelessWidget {
  const _DashboardAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              Icon(icon, color: color, size: 25),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: textTheme.titleSmall?.copyWith(
                        color: sankatInk,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.arrow_forward, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _ToolChip extends StatelessWidget {
  const _ToolChip({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: Icon(icon, size: 18),
      label: Text(label),
      onPressed: onPressed,
    );
  }
}
