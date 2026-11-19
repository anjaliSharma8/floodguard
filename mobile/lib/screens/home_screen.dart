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
    String t(String key) => AppText.text(widget.language, key);
    return Scaffold(
      appBar: AppBar(
        title: const Text('SankatSetu'),
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
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              t('welcome'),
              style: const TextStyle(
                color: sankatInk,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Pune and Pimpri-Chinchwad · Static road-graph demo coverage',
              style: TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 14),
            Card(
              color: _backendReachable == true
                  ? Colors.green.shade50
                  : Colors.blueGrey.shade50,
              child: ListTile(
                leading: _checkingConnection
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(
                        _backendReachable == true
                            ? Icons.cloud_done_outlined
                            : Icons.cloud_off_outlined,
                        color: _backendReachable == true
                            ? Colors.green.shade800
                            : Colors.blueGrey,
                      ),
                title: Text(
                  _checkingConnection
                      ? t('loading')
                      : _backendReachable == true
                      ? t('connected')
                      : t('offline'),
                ),
                subtitle: Text(
                  _connectionError ?? 'Backend: ${widget.api.baseUrl}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: IconButton(
                  onPressed: _checkingConnection ? null : _checkConnection,
                  icon: const Icon(Icons.refresh),
                  tooltip: t('retry'),
                ),
              ),
            ),
            const SizedBox(height: 10),
            const DemoDataNotice(),
            const SizedBox(height: 18),
            Text(
              'Emergency support',
              style: Theme.of(context).textTheme.titleLarge
                  ?.copyWith(color: sankatInk, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            FeatureTile(
              icon: Icons.sos,
              title: t('emergency'),
              subtitle: 'Call existing services, view facilities and location',
              color: Colors.red,
              onTap: () => widget.onOpenFeature('emergency'),
            ),
            FeatureTile(
              icon: Icons.alt_route,
              title: t('safeRoutes'),
              subtitle:
                  'Compare safest and shortest routes in the Pune demo graph',
              color: sankatPrimary,
              onTap: () => widget.onOpenFeature('routes'),
            ),
            FeatureTile(
              icon: Icons.campaign_outlined,
              title: t('reports'),
              subtitle:
                  'Submit a report and view its server verification status',
              color: Colors.deepOrange,
              onTap: () => widget.onOpenFeature('reports'),
            ),
            FeatureTile(
              icon: Icons.warning_amber_outlined,
              title: t('alerts'),
              subtitle: 'In-app road-risk and community report advisories',
              color: Colors.orange,
              onTap: () => widget.onOpenFeature('alerts'),
            ),
            FeatureTile(
              icon: Icons.map_outlined,
              title: t('map'),
              subtitle:
                  'Road risk, blockage status and community incident markers',
              color: Colors.indigo,
              onTap: () => widget.onOpenFeature('map'),
            ),
            FeatureTile(
              icon: Icons.menu_book_outlined,
              title: t('offlineGuide'),
              subtitle:
                  'Preparedness, evacuation, safety and recovery guidance',
              color: Colors.teal,
              onTap: () => widget.onOpenFeature('guide'),
            ),
            FeatureTile(
              icon: Icons.chat_bubble_outline,
              title: t('assistant'),
              subtitle: 'Ask the backend emergency guidance assistant',
              color: Colors.purple,
              onTap: () => widget.onOpenFeature('assistant'),
            ),
            FeatureTile(
              icon: Icons.bookmark_outline,
              title: t('savedInfo'),
              subtitle: 'Information saved locally on this device',
              color: Colors.blue,
              onTap: () => widget.onOpenFeature('saved'),
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
