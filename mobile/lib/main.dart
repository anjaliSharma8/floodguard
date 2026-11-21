import 'package:material_ui/material_ui.dart';
import 'models/app_models.dart';
import 'screens/alerts_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/chat_assistant_screen.dart';
import 'screens/emergency_screen.dart';
import 'screens/flood_map_screen.dart';
import 'screens/global_search_screen.dart';
import 'screens/home_screen.dart';
import 'screens/incident_reports_screen.dart';
import 'screens/offline_guide_screen.dart';
import 'screens/safe_route_planner.dart';
import 'screens/saved_information_screen.dart';
import 'screens/settings_screen.dart';
import 'l10n/generated/app_localizations.dart';
import 'l10n/app_localization_support.dart';
import 'services/api_service.dart';
import 'services/app_storage.dart';
import 'widgets/language_selector.dart';

enum AppSessionState { unauthenticated, guest, authenticated }

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
  bool _isGuest = false;
  bool _ready = false;

  AppSessionState get _sessionState {
    if (_token != null) return AppSessionState.authenticated;
    if (_isGuest) return AppSessionState.guest;
    return AppSessionState.unauthenticated;
  }

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
    var isGuest = false;
    var language = 'en';
    String? error;
    try {
      token = await _storage.readToken();
      isGuest = await _storage.readGuestMode();
      language = await _storage.readLanguage();
      if (token != null && token.isNotEmpty) {
        try {
          await _api.validateSession(token: token);
          isGuest = false;
        } on ApiException catch (exception) {
          if (exception.statusCode == 401 || exception.statusCode == 403) {
            token = null;
            await _storage.clearToken();
          } else {
            error =
                '${lookupAppLocalizations(Locale(language)).sessionVerifyOffline} $exception';
          }
        }
      } else {
        token = null;
      }
    } on Exception catch (exception) {
      error = lookupAppLocalizations(Locale(language))
          .startupRestoreError(exception.toString());
    }
    if (!mounted) return;
    setState(() {
      _token = token;
      _isGuest = token == null && isGuest;
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
    if (!supportedLanguageCodes.contains(language)) {
      throw ArgumentError.value(language, 'language', 'Unsupported locale');
    }
    final localizations = AppLocalizations.of(_navigatorKey.currentContext!);
    try {
      await _storage.writeLanguage(language);
      if (mounted) setState(() => _language = language);
    } on Exception catch (error) {
      if (!mounted) return;
      _messengerKey.currentState?.showSnackBar(
        SnackBar(
          content: Text(localizations.saveLanguageError(error.toString())),
        ),
      );
    }
  }

  Future<void> _signOut() async {
    final localizations = AppLocalizations.of(_navigatorKey.currentContext!);
    try {
      await _storage.clearToken();
      await _storage.writeGuestMode(false);
      if (mounted) {
        setState(() {
          _token = null;
          _isGuest = false;
          _selectedTab = 0;
          _visitedTabs
            ..clear()
            ..add(0);
        });
      }
    } on Exception catch (error) {
      if (!mounted) return;
      _messengerKey.currentState?.showSnackBar(
        SnackBar(content: Text(localizations.signOutError(error.toString()))),
      );
    }
  }

  Future<void> _continueAsGuest() async {
    final localizations = AppLocalizations.of(_navigatorKey.currentContext!);
    try {
      await _storage.writeGuestMode(true);
      if (mounted) {
        setState(() {
          _token = null;
          _isGuest = true;
        });
      }
    } on Exception catch (error) {
      if (!mounted) return;
      _messengerKey.currentState?.showSnackBar(
        SnackBar(content: Text(localizations.saveGuestError(error.toString()))),
      );
    }
  }

  Future<void> _openLogin() async {
    final navigator = _navigatorKey.currentState;
    if (navigator == null) return;
    await navigator.push<void>(
      MaterialPageRoute(
        builder: (_) => AuthScreen(
          api: _api,
          language: _language,
          onLanguageChanged: _changeLanguage,
          initialMode: AuthScreenMode.login,
          onAuthenticated: (session) async {
            await _saveAuthenticatedSession(session);
            if (mounted) navigator.pop();
          },
        ),
      ),
    );
  }

  Future<void> _onAuthenticated(AuthSession session) =>
      _saveAuthenticatedSession(session);

  Future<void> _saveAuthenticatedSession(AuthSession session) async {
    await _storage.writeToken(session.token);
    if (mounted) setState(() => _token = session.token);
  }

  void _openFeature(String feature) {
    final Widget screen = switch (feature) {
      'emergency' => EmergencyScreen(api: _api, storage: _storage),
      'shelter' => EmergencyScreen(api: _api, storage: _storage),
      'routes' => SafeRoutePlannerScreen(api: _api, storage: _storage),
      'reports' => IncidentReportsScreen(
        api: _api,
        token: _token,
        onLogin: _openLogin,
      ),
      'alerts' => AlertsScreen(api: _api),
      'map' => FloodMapScreen(api: _api),
      'guide' => const OfflineGuideScreen(),
      'assistant' => ChatAssistantScreen(
        api: _api,
        onOpenGuide: () => _openFeature('guide'),
      ),
      'saved' => SavedInformationScreen(storage: _storage),
      _ => Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: Text(AppLocalizations.of(context).featureUnavailable),
          ),
        ),
      ),
    };
    _navigatorKey.currentState!.push(
      MaterialPageRoute<void>(builder: (_) => screen),
    );
  }

  void _openSettings() {
    _navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => SettingsScreen(
          onLanguageChanged: _changeLanguage,
          isSignedIn: _sessionState == AppSessionState.authenticated,
          isGuest: _sessionState == AppSessionState.guest,
          onSignOut: _signOut,
          onLogin: _openLogin,
        ),
      ),
    );
  }

  void _openSearch() {
    _navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) => GlobalSearchScreen(
          api: _api,
          onOpenFeature: _openFeature,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      scaffoldMessengerKey: _messengerKey,
      debugShowCheckedModeBanner: false,
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      locale: Locale(_language),
      supportedLocales: AppLocalizationSupport.supportedLocales,
      localizationsDelegates: AppLocalizationSupport.delegates,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF4F7FA),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF087E8B)),
      ),
      home: !_ready
          ? _buildStartupScreen()
          : _sessionState == AppSessionState.unauthenticated
          ? AuthScreen(
              api: _api,
              language: _language,
              onLanguageChanged: _changeLanguage,
              onAuthenticated: _onAuthenticated,
              onContinueAsGuest: _continueAsGuest,
            )
          : Scaffold(
              body: IndexedStack(
                index: _selectedTab,
                children: [
                  HomeScreen(
                    api: _api,
                    onOpenSettings: _openSettings,
                    onOpenSearch: _openSearch,
                    onOpenFeature: _openFeature,
                    isSignedIn: _sessionState == AppSessionState.authenticated,
                    isGuest: _sessionState == AppSessionState.guest,
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
                      ? EmergencyScreen(api: _api, storage: _storage)
                      : const SizedBox.shrink(),
                ],
              ),
              bottomNavigationBar: Builder(
                builder: (context) {
                  final l10n = AppLocalizations.of(context);
                  return NavigationBar(
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
                        label: l10n.home,
                      ),
                      NavigationDestination(
                        icon: const Icon(Icons.map_outlined),
                        label: l10n.map,
                      ),
                      NavigationDestination(
                        icon: const Icon(Icons.assignment_outlined),
                        label: l10n.reports,
                      ),
                      NavigationDestination(
                        icon: const Icon(Icons.emergency_outlined),
                        label: l10n.emergency,
                      ),
                    ],
                  );
                },
              ),
            ),
    );
  }

  Widget _buildStartupScreen() {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(
              'assets/sankatsetu_logo.png',
              width: 180,
              height: 130,
              fit: BoxFit.contain,
              semanticLabel: 'SankatSetu logo',
            ),
            const SizedBox(height: 16),
            const Text(
              'SankatSetu',
              style: TextStyle(
                color: Color(0xFF087E8B),
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 20),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ],
        ),
      ),
    );
  }
}
