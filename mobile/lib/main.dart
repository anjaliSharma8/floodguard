import 'package:material_ui/material_ui.dart';

import 'app_text.dart';
import 'models/app_models.dart';
import 'screens/alerts_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/chat_assistant_screen.dart';
import 'screens/emergency_screen.dart';
import 'screens/flood_map_screen.dart';
import 'screens/home_screen.dart';
import 'screens/incident_reports_screen.dart';
import 'screens/offline_guide_screen.dart';
import 'screens/safe_route_planner.dart';
import 'screens/saved_information_screen.dart';
import 'services/api_service.dart';
import 'services/app_storage.dart';

void main() {
  runApp(const SankatSetuApp());
}

class SankatSetuApp extends StatefulWidget {
  const SankatSetuApp({super.key, this.api, this.storage});

  final ApiService? api;
  final AppStorage? storage;

  @override
  State<SankatSetuApp> createState() => _SankatSetuAppState();
}

class _SankatSetuAppState extends State<SankatSetuApp> {
  late final ApiService _api = widget.api ?? ApiService();
  late final AppStorage _storage = widget.storage ?? AppStorage();
  late final bool _ownsApi = widget.api == null;
  final _navigatorKey = GlobalKey<NavigatorState>();
  final _messengerKey = GlobalKey<ScaffoldMessengerState>();
  int _selectedTab = 0;
  final Set<int> _visitedTabs = {0};
  String _language = 'en';
  String? _token;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _restoreLocalState();
  }

  @override
  void dispose() {
    if (_ownsApi) _api.close();
    super.dispose();
  }

  Future<void> _restoreLocalState() async {
    String? token;
    var language = 'en';
    String? error;
    try {
      token = await _storage.readToken();
      language = await _storage.readLanguage();
    } on Exception catch (exception) {
      error = 'Could not restore saved app settings: $exception';
    }
    if (!mounted) return;
    setState(() {
      _token = token;
      _language = language;
      _ready = true;
    });
    if (error != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _messengerKey.currentState?.showSnackBar(
            SnackBar(content: Text(error!)),
          );
        }
      });
    }
  }

  Future<void> _changeLanguage(String language) async {
    try {
      await _storage.writeLanguage(language);
      if (mounted) setState(() => _language = language);
    } on Exception catch (error) {
      if (!mounted) return;
      _messengerKey.currentState?.showSnackBar(
        SnackBar(content: Text('Could not save language preference: $error')),
      );
    }
  }

  Future<void> _signOut() async {
    try {
      await _storage.clearToken();
      if (mounted) setState(() => _token = null);
    } on Exception catch (error) {
      if (!mounted) return;
      _messengerKey.currentState?.showSnackBar(
        SnackBar(content: Text('Could not sign out safely: $error')),
      );
    }
  }

  Future<void> _openLogin() async {
    await _navigatorKey.currentState!.push<void>(
      MaterialPageRoute(
        builder: (_) => AuthScreen(
          api: _api,
          language: _language,
          onAuthenticated: _onAuthenticated,
        ),
      ),
    );
  }

  Future<void> _onAuthenticated(AuthSession session) async {
    try {
      await _storage.writeToken(session.token);
      if (!mounted) return;
      setState(() => _token = session.token);
      _navigatorKey.currentState!.pop();
      _messengerKey.currentState?.showSnackBar(
        SnackBar(content: Text('Signed in as ${session.fullName}.')),
      );
    } on Exception catch (error) {
      if (!mounted) return;
      _messengerKey.currentState?.showSnackBar(
        SnackBar(content: Text('Could not securely save sign-in: $error')),
      );
    }
  }

  void _openFeature(String feature) {
    final Widget screen = switch (feature) {
      'emergency' => EmergencyScreen(
        api: _api,
        storage: _storage,
        language: _language,
      ),
      'routes' => SafeRoutePlannerScreen(api: _api, storage: _storage),
      'reports' => IncidentReportsScreen(
        api: _api,
        token: _token,
        onLogin: _openLogin,
      ),
      'alerts' => AlertsScreen(api: _api),
      'map' => FloodMapScreen(api: _api),
      'guide' => OfflineGuideScreen(language: _language),
      'assistant' => ChatAssistantScreen(api: _api, language: _language),
      'saved' => SavedInformationScreen(storage: _storage),
      _ => const Scaffold(
        body: Center(child: Text('This feature is unavailable.')),
      ),
    };
    _navigatorKey.currentState!.push(
      MaterialPageRoute<void>(builder: (_) => screen),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      scaffoldMessengerKey: _messengerKey,
      debugShowCheckedModeBanner: false,
      title: 'SankatSetu',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF4F7FA),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF087E8B)),
        fontFamily: 'Roboto',
      ),
      home: !_ready
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : Scaffold(
              body: IndexedStack(
                index: _selectedTab,
                children: [
                  HomeScreen(
                    api: _api,
                    language: _language,
                    onLanguageChanged: _changeLanguage,
                    onOpenFeature: _openFeature,
                    onOpenLogin: _openLogin,
                    onSignOut: _signOut,
                    isSignedIn: _token != null,
                  ),
                  _visitedTabs.contains(1)
                      ? FloodMapScreen(api: _api)
                      : const SizedBox.shrink(),
                  _visitedTabs.contains(2)
                      ? IncidentReportsScreen(
                          api: _api,
                          token: _token,
                          onLogin: _openLogin,
                        )
                      : const SizedBox.shrink(),
                  _visitedTabs.contains(3)
                      ? EmergencyScreen(
                          api: _api,
                          storage: _storage,
                          language: _language,
                        )
                      : const SizedBox.shrink(),
                ],
              ),
              bottomNavigationBar: NavigationBar(
                selectedIndex: _selectedTab,
                onDestinationSelected: (index) {
                  setState(() {
                    _visitedTabs.add(index);
                    _selectedTab = index;
                  });
                },
                destinations: [
                  NavigationDestination(
                    icon: const Icon(Icons.home_outlined),
                    selectedIcon: const Icon(Icons.home),
                    label: AppText.text(_language, 'home'),
                  ),
                  NavigationDestination(
                    icon: const Icon(Icons.map_outlined),
                    label: AppText.text(_language, 'map'),
                  ),
                  NavigationDestination(
                    icon: const Icon(Icons.assignment_outlined),
                    label: AppText.text(_language, 'reports'),
                  ),
                  NavigationDestination(
                    icon: const Icon(Icons.emergency_outlined),
                    label: AppText.text(_language, 'emergency'),
                  ),
                ],
              ),
            ),
    );
  }
}
