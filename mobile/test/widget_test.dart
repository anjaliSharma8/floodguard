import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sankatsetu/models/app_models.dart';
import 'package:sankatsetu/main.dart';
import 'package:sankatsetu/l10n/app_localization_support.dart';
import 'package:sankatsetu/screens/home_screen.dart';
import 'package:sankatsetu/screens/alerts_screen.dart';
import 'package:sankatsetu/screens/chat_assistant_screen.dart';
import 'package:sankatsetu/screens/emergency_screen.dart';
import 'package:sankatsetu/screens/flood_map_screen.dart';
import 'package:sankatsetu/screens/global_search_screen.dart';
import 'package:sankatsetu/screens/incident_reports_screen.dart';
import 'package:sankatsetu/screens/offline_guide_screen.dart';
import 'package:sankatsetu/screens/safe_route_planner.dart';
import 'package:sankatsetu/screens/saved_information_screen.dart';
import 'package:sankatsetu/services/api_service.dart';
import 'package:sankatsetu/services/app_storage.dart';
import 'package:sankatsetu/services/location_service.dart';
import 'package:sankatsetu/widgets/road_network_map.dart';

const configuredApiBaseUrl = String.fromEnvironment('SANKATSETU_API_BASE_URL');

void main() {
  testWidgets('SankatSetu dashboard loads', (WidgetTester tester) async {
    final api = _mockApi();
    await tester.pumpWidget(SankatSetuApp(api: api, storage: _TestStorage()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byKey(const ValueKey('home-logo')), findsOneWidget);
    expect(find.text('Your safety, our priority'), findsOneWidget);
    expect(find.text('Map near you'), findsOneWidget);
    final home = find.byType(HomeScreen);
    await tester.scrollUntilVisible(
      find.text('Emergency actions'),
      200,
      scrollable: find
          .descendant(of: home, matching: find.byType(Scrollable))
          .first,
    );
    expect(find.text('Emergency actions'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Safe Route Planner'),
      200,
      scrollable: find
          .descendant(of: home, matching: find.byType(Scrollable))
          .first,
    );
    expect(find.text('Safe Route Planner'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Report Hazard'),
      200,
      scrollable: find
          .descendant(of: home, matching: find.byType(Scrollable))
          .first,
    );
    expect(find.text('Report Hazard'), findsOneWidget);
    expect(find.byTooltip('Search resources'), findsOneWidget);
    expect(find.byTooltip('Disaster Alerts'), findsOneWidget);
    expect(find.byTooltip('Settings'), findsOneWidget);
    expect(find.text('Risk Map'), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('home map only shows nearby road data for covered GPS location', (
    WidgetTester tester,
  ) async {
    final api = _mapPreviewApi();
    await tester.pumpWidget(
      _localizedApp(
        home: HomeScreen(
          api: api,
          onOpenSettings: () {},
          onOpenSearch: () {},
          onOpenFeature: (_) {},
          isSignedIn: false,
          isGuest: true,
          locationService: _FakeLocationService(
            () async => _testPosition(18.5001, 73.8001),
            existingPosition: _testPosition(18.5001, 73.8001),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Pune Road Node'), findsOneWidget);
    expect(find.text('Static demo data'), findsOneWidget);
    expect(find.textContaining('72/100'), findsOneWidget);
    expect(find.byTooltip('Disaster Alerts'), findsOneWidget);
    expect(find.byType(RoadNetworkMap), findsOneWidget);
  });

  testWidgets('home map identifies outdated road records as stale', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      _localizedApp(
        home: HomeScreen(
          api: _mapPreviewApi(timestampAge: const Duration(days: 2)),
          onOpenSettings: () {},
          onOpenSearch: () {},
          onOpenFeature: (_) {},
          isSignedIn: false,
          isGuest: true,
          locationService: _FakeLocationService(
            () async => _testPosition(18.5001, 73.8001),
            existingPosition: _testPosition(18.5001, 73.8001),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Stale data'), findsOneWidget);
    expect(
      find.textContaining('not an exact GPS-point reading'),
      findsOneWidget,
    );
  });

  testWidgets('home map hides Pune records for an out-of-coverage location', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      _localizedApp(
        home: HomeScreen(
          api: _mapPreviewApi(),
          onOpenSettings: () {},
          onOpenSearch: () {},
          onOpenFeature: (_) {},
          isSignedIn: false,
          isGuest: true,
          locationService: _FakeLocationService(
            () async => _testPosition(19.0760, 72.8777),
            existingPosition: _testPosition(19.0760, 72.8777),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.textContaining('outside the available road-network'),
      findsWidgets,
    );
    expect(find.textContaining('72/100'), findsNothing);
    expect(find.text('Pune Road Node'), findsNothing);
    expect(find.byIcon(Icons.my_location), findsOneWidget);
  });

  testWidgets('dashboard fits on a compact screen in every supported locale', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    for (final locale in ['en', 'hi', 'mr', 'gu', 'ta', 'te']) {
      await tester.pumpWidget(
        _localizedApp(
          locale: locale,
          home: HomeScreen(
            api: _mapPreviewApi(),
            onOpenSettings: () {},
            onOpenSearch: () {},
            onOpenFeature: (_) {},
            isSignedIn: false,
            isGuest: true,
            locationService: _FakeLocationService(
              () async => _testPosition(18.5001, 73.8001),
              existingPosition: _testPosition(18.5001, 73.8001),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.takeException(), isNull, reason: 'locale $locale');
      expect(find.byType(HomeScreen), findsOneWidget);
    }
  });

  testWidgets('global search returns only matching backend records', (
    WidgetTester tester,
  ) async {
    final api = ApiService(
      client: MockClient((request) async {
        if (request.url.path == '/api/shelters') {
          return http.Response(
            jsonEncode([
              {
                'id': 'S1',
                'name': 'Riverbank Shelter',
                'address': 'Pune',
                'contact': '',
                'lat': 18.5,
                'lng': 73.8,
                'capacity': 40,
                'currentOccupancy': 12,
                'petFriendly': false,
                'wheelchairAccessible': false,
              },
            ]),
            200,
          );
        }
        if (request.url.path == '/api/roads') {
          return http.Response(jsonEncode({'nodes': {}, 'segments': []}), 200);
        }
        return http.Response('[]', 200);
      }),
    );
    String? openedFeature;
    await tester.pumpWidget(
      _localizedApp(
        home: GlobalSearchScreen(
          api: api,
          onOpenFeature: (feature) => openedFeature = feature,
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextField), 'Riverbank');
    await tester.pump();
    expect(find.text('Riverbank Shelter'), findsOneWidget);
    await tester.tap(find.byTooltip('Open related feature'));
    expect(openedFeature, 'emergency');

    await tester.tap(find.byTooltip('Clear search'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'not a real resource');
    await tester.pump();
    expect(find.text('No matching records were found.'), findsOneWidget);
    expect(find.text('Riverbank Shelter'), findsNothing);
    expect(find.text('not a real resource'), findsOneWidget);
  });

  testWidgets(
    'global search reports unavailable backend data without fixtures',
    (WidgetTester tester) async {
      final api = ApiService(
        client: MockClient((_) async => http.Response('Unavailable', 503)),
      );
      await tester.pumpWidget(
        _localizedApp(
          home: GlobalSearchScreen(api: api, onOpenFeature: (_) {}),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(
        find.text(
          'Search records are unavailable right now. Check your connection and retry.',
        ),
        findsOneWidget,
      );
      expect(find.text('Riverbank Shelter'), findsNothing);
      expect(find.text('Retry'), findsOneWidget);
    },
  );

  testWidgets('assistant offers localized safety questions and offline guide', (
    WidgetTester tester,
  ) async {
    var openedGuide = false;
    await tester.pumpWidget(
      _localizedApp(
        home: ChatAssistantScreen(
          api: ApiService(
            client: MockClient((_) async => http.Response('{}', 200)),
          ),
          onOpenGuide: () => openedGuide = true,
        ),
      ),
    );

    expect(find.text('When should I evacuate during a flood?'), findsOneWidget);
    await tester.tap(find.byTooltip('Preparedness Guide'));
    expect(openedGuide, isTrue);
  });

  testWidgets(
    'risk map explains missing backend data without Pune fallback',
    (WidgetTester tester) async {
      final api = ApiService(
        client: MockClient((_) async => http.Response('Unavailable', 503)),
      );
      await tester.pumpWidget(_localizedApp(home: FloodMapScreen(api: api)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(RoadNetworkMap), findsNothing);
      expect(find.text('Map data unavailable'), findsOneWidget);
      expect(find.text('Road network data is unavailable.'), findsOneWidget);
      expect(find.textContaining('18.5204'), findsNothing);
    },
  );

  testWidgets(
    'risk map hides Pune records for an out-of-coverage GPS location',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        _localizedApp(
          home: FloodMapScreen(
            api: _mapPreviewApi(),
            locationService: _FakeLocationService(
              () async => _testPosition(19.0760, 72.8777),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      await tester.tap(find.text('Use My Current Location'));
      await tester.pump();

      expect(
        find.textContaining('outside the available road-network'),
        findsOneWidget,
      );
      expect(find.text('Pune Road Node'), findsNothing);
      expect(find.byType(RoadNetworkMap), findsOneWidget);
    },
  );

  testWidgets(
    'an unauthenticated launch shows welcome choices instead of the app shell',
    (WidgetTester tester) async {
      var sessionChecks = 0;
      final api = ApiService(
        client: MockClient((request) async {
          if (request.url.path == '/api/auth/me') sessionChecks++;
          return http.Response('Not found', 404);
        }),
      );
      await tester.pumpWidget(
        SankatSetuApp(api: api, storage: _TestStorage(token: null)),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Welcome to SankatSetu'), findsOneWidget);
      expect(find.text('Continue as Guest'), findsOneWidget);
      expect(find.text('Login'), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      expect(sessionChecks, 0);
    },
  );

  testWidgets('guest mode persists across restart and logout clears it', (
    WidgetTester tester,
  ) async {
    var authRequests = 0;
    final api = ApiService(
      client: MockClient((request) async {
        if (request.url.path == '/api/auth/citizen/login' ||
            request.url.path == '/api/auth/citizen/register' ||
            request.url.path == '/api/auth/me') {
          authRequests++;
        }
        if (request.url.path == '/api/health') {
          return http.Response(jsonEncode({'status': 'ok'}), 200);
        }
        if (request.url.path == '/api/roads') {
          return http.Response(jsonEncode({'nodes': {}, 'segments': []}), 200);
        }
        return http.Response('[]', 200);
      }),
    );
    final storage = _TestStorage(token: null);

    await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.text('Continue as Guest'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(storage.guestMode, isTrue);
    expect(storage.token, isNull);
    expect(authRequests, 0);
    expect(find.byType(NavigationBar), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(storage.guestMode, isTrue);
    expect(find.text('Your safety, our priority'), findsOneWidget);
    expect(find.text('Welcome to SankatSetu'), findsNothing);
    expect(authRequests, 0);

    final emergencyTab = find.descendant(
      of: find.byType(NavigationBar),
      matching: find.byIcon(Icons.emergency_outlined),
    );
    await tester.tap(emergencyTab);
    await tester.pumpAndSettle();
    expect(
      find.descendant(
        of: find.byType(AppBar).last,
        matching: find.text('Emergency'),
      ),
      findsOneWidget,
    );

    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.byIcon(Icons.home_outlined),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('Sign out of guest mode'), findsOneWidget);
    await tester.tap(find.text('Sign out of guest mode'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();

    expect(storage.guestMode, isFalse);
    expect(storage.token, isNull);
    expect(find.text('Welcome to SankatSetu'), findsOneWidget);
    expect(find.text('Continue as Guest'), findsOneWidget);
    expect(authRequests, 0);
  });

  testWidgets('language switching persists and preserves guest access', (
    WidgetTester tester,
  ) async {
    final api = _mockApi();
    final storage = _TestStorage(token: null);
    await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('language-selector-en')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ગુજરાતી').last);
    await tester.pumpAndSettle();

    expect(find.text('સંકટસેતુમાં આપનું સ્વાગત છે'), findsOneWidget);
    expect(storage.language, 'gu');
    await tester.tap(find.text('મહેમાન તરીકે ચાલુ રાખો'));
    await tester.pumpAndSettle();

    expect(storage.guestMode, isTrue);
    expect(storage.token, isNull);
    expect(find.text('તમારી સુરક્ષા, અમારી પ્રાથમિકતા'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
    await tester.pumpAndSettle();

    expect(storage.guestMode, isTrue);
    expect(storage.token, isNull);
    expect(storage.language, 'gu');
    expect(find.text('તમારી સુરક્ષા, અમારી પ્રાથમિકતા'), findsOneWidget);
    expect(find.text('સંકટસેતુમાં આપનું સ્વાગત છે'), findsNothing);
  });

  testWidgets('language switching in settings preserves registered session', (
    WidgetTester tester,
  ) async {
    final api = _mockApi();
    final storage = _TestStorage(token: 'registered-token');
    await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
    await tester.pumpAndSettle();

    expect(find.text('Your safety, our priority'), findsOneWidget);
    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('language-selector-en')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('தமிழ்').last);
    await tester.pumpAndSettle();

    expect(find.text('சுயவிவரம் மற்றும் அமைப்புகள்'), findsOneWidget);
    expect(storage.token, 'registered-token');
    expect(storage.guestMode, isFalse);
    expect(storage.language, 'ta');

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
    await tester.pumpAndSettle();
    expect(storage.token, 'registered-token');
    expect(storage.language, 'ta');
    expect(find.text('உங்கள் பாதுகாப்பே எங்கள் முன்னுரிமை'), findsOneWidget);
  });

  testWidgets('a saved registered session is restored as authenticated', (
    WidgetTester tester,
  ) async {
    var sessionChecks = 0;
    final api = ApiService(
      client: MockClient((request) async {
        if (request.url.path == '/api/auth/me') {
          sessionChecks++;
          expect(
            request.headers['authorization'],
            'Bearer saved-citizen-token',
          );
          return http.Response(
            jsonEncode({
              'success': true,
              'user': {
                'id': 'USR_CITIZEN_1',
                'fullName': 'Citizen User',
                'email': 'citizen@example.test',
                'role': 'CITIZEN',
              },
            }),
            200,
          );
        }
        if (request.url.path == '/api/health') {
          return http.Response(jsonEncode({'status': 'ok'}), 200);
        }
        return http.Response('[]', 200);
      }),
    );
    final storage = _TestStorage();
    await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(sessionChecks, 1);
    expect(find.text('Your safety, our priority'), findsOneWidget);
    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('Sign out'), findsOneWidget);
    expect(find.text('Continue as Guest'), findsNothing);
  });

  testWidgets('an expired saved session is cleared before login is shown', (
    WidgetTester tester,
  ) async {
    final storage = _TestStorage(token: 'expired-token');
    final api = ApiService(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({'error': 'Invalid or expired session token.'}),
          401,
        ),
      ),
    );
    await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Welcome to SankatSetu'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(storage.token, isNull);
  });

  testWidgets(
    'saved session remains usable when backend validation is offline',
    (WidgetTester tester) async {
      final api = ApiService(
        client: MockClient(
          (_) async => throw http.ClientException('Network is unavailable'),
        ),
      );
      await tester.pumpWidget(SankatSetuApp(api: api, storage: _TestStorage()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Your safety, our priority'), findsOneWidget);
      expect(find.byType(NavigationBar), findsOneWidget);
    },
  );

  testWidgets(
    'sign up validates confirmation and creates an authenticated session',
    (WidgetTester tester) async {
      tester.view.physicalSize = const Size(400, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      Map<String, dynamic>? registrationBody;
      final api = ApiService(
        client: MockClient((request) async {
          if (request.url.path == '/api/auth/citizen/register') {
            registrationBody = jsonDecode(request.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode({
                'success': true,
                'token': 'new-citizen-token',
                'user': {
                  'id': 'USR_CITIZEN_NEW',
                  'fullName': 'New Citizen',
                  'email': 'new@example.test',
                  'role': 'CITIZEN',
                },
              }),
              201,
            );
          }
          return http.Response('Not found', 404);
        }),
      );
      final storage = _TestStorage(token: null);
      await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      await tester.tap(find.text('Create Account / Sign Up'));
      await tester.pump();

      final fields = find.byType(TextFormField);
      await tester.enterText(fields.at(0), 'New Citizen');
      await tester.enterText(fields.at(1), 'new@example.test');
      await tester.enterText(fields.at(2), 'secure-pass');
      await tester.enterText(fields.at(3), 'different-pass');
      final signUpButton = find.widgetWithText(FilledButton, 'Sign Up');
      await tester.ensureVisible(signUpButton);
      await tester.tap(signUpButton);
      await tester.pump();

      expect(find.text('Passwords do not match.'), findsOneWidget);
      expect(registrationBody, isNull);

      await tester.ensureVisible(fields.at(3));
      await tester.enterText(fields.at(3), 'secure-pass');
      await tester.ensureVisible(signUpButton);
      await tester.tap(signUpButton);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(registrationBody?['fullName'], 'New Citizen');
      expect(registrationBody?['email'], 'new@example.test');
      expect(registrationBody?['password'], 'secure-pass');
      expect(storage.token, 'new-citizen-token');
      expect(find.text('Your safety, our priority'), findsOneWidget);
    },
  );

  testWidgets('login enters the dashboard and logout returns to login', (
    WidgetTester tester,
  ) async {
    final storage = _TestStorage(token: null);
    final api = ApiService(
      client: MockClient((request) async {
        if (request.url.path == '/api/auth/citizen/login') {
          return http.Response(
            jsonEncode({
              'token': 'signed-in-token',
              'user': {
                'id': 'USR_CITIZEN_1',
                'fullName': 'Citizen User',
                'email': 'citizen@example.test',
                'role': 'CITIZEN',
              },
            }),
            200,
          );
        }
        if (request.url.path == '/api/health') {
          return http.Response(jsonEncode({'status': 'ok'}), 200);
        }
        return http.Response('Not found', 404);
      }),
    );
    await tester.pumpWidget(SankatSetuApp(api: api, storage: storage));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('Login'));
    await tester.pump();

    await tester.enterText(
      find.byType(TextFormField).at(0),
      'citizen@example.test',
    );
    await tester.enterText(find.byType(TextFormField).at(1), 'pass123');
    final loginButton = find.widgetWithText(FilledButton, 'Login');
    await tester.ensureVisible(loginButton);
    await tester.tap(loginButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(storage.token, 'signed-in-token');
    expect(find.text('Your safety, our priority'), findsOneWidget);

    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(storage.token, isNull);
    expect(find.text('Welcome to SankatSetu'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });

  testWidgets('route action remains visible with the keyboard open', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);

    final client = MockClient(
      (_) async =>
          http.Response(jsonEncode({'nodes': {}, 'segments': []}), 200),
    );
    await tester.pumpWidget(
      _localizedApp(home: SafeRoutePlannerScreen(client: client)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    final actionBounds = tester.getRect(find.text('Find Safe Route'));
    expect(actionBounds.top, greaterThanOrEqualTo(0));
    expect(actionBounds.bottom, lessThan(360));
  });

  testWidgets('Home feature cards and sign-in open their destination screens', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      SankatSetuApp(api: _mockApi(), storage: _TestStorage()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    const destinations = <(String, Type)>[
      ('Emergency Assistance', EmergencyScreen),
      ('Safe Route Planner', SafeRoutePlannerScreen),
      ('Shelters', EmergencyScreen),
      ('Report Hazard', IncidentReportsScreen),
      ('Disaster Alerts', AlertsScreen),
      ('Preparedness Guide', OfflineGuideScreen),
      ('Emergency Assistant', ChatAssistantScreen),
      ('Saved Information', SavedInformationScreen),
    ];

    for (final (cardTitle, screenType) in destinations) {
      final home = find.byType(HomeScreen);
      final card = find.descendant(of: home, matching: find.text(cardTitle));
      await tester.scrollUntilVisible(
        card,
        250,
        scrollable: find
            .descendant(of: home, matching: find.byType(Scrollable))
            .first,
      );
      final tapTarget = find.ancestor(of: card, matching: find.byType(InkWell));
      expect(tester.widget<InkWell>(tapTarget.first).onTap, isNotNull);
      await tester.ensureVisible(tapTarget.first);
      await tester.pump();
      await tester.tap(tapTarget.first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(
        find.byType(screenType),
        findsOneWidget,
        reason: '$cardTitle navigation',
      );
      await tester.pageBack();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
    }

    final home = find.byType(HomeScreen);
    final mapAction = find.descendant(
      of: home,
      matching: find.text('View Full Risk Map'),
    );
    final homeScroll = find
        .descendant(
          of: find.byType(HomeScreen),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.drag(homeScroll, const Offset(0, 1200));
    await tester.pumpAndSettle();
    await tester.ensureVisible(mapAction);
    await tester.tap(mapAction);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(FloodMapScreen), findsOneWidget);
  });

  testWidgets('bottom navigation switches all four tabs', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      SankatSetuApp(api: _mockApi(), storage: _TestStorage()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    Future<void> tapTab(IconData icon, String expectedTitle) async {
      final tabIcon = find.descendant(
        of: find.byType(NavigationBar),
        matching: find.byIcon(icon),
      );
      await tester.tap(tabIcon);
      await tester.pumpAndSettle();
      final destination = expectedTitle == 'Your safety, our priority'
          ? find.text(expectedTitle)
          : find.descendant(
              of: find.byType(AppBar).last,
              matching: find.text(expectedTitle),
            );
      expect(destination, findsOneWidget);
    }

    await tapTab(Icons.map_outlined, 'Flood risk map');
    await tapTab(Icons.assignment_outlined, 'Community incidents');
    await tapTab(Icons.emergency_outlined, 'Emergency');
    await tapTab(Icons.home_outlined, 'Your safety, our priority');
  });

  testWidgets(
    'offline guide renders translated instructions without a backend',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        _localizedApp(locale: 'hi', home: const OfflineGuideScreen()),
      );

      expect(find.text('तैयारी मार्गदर्शिका'), findsOneWidget);
      expect(
        find.textContaining('बाढ़ के पानी में पैदल न चलें'),
        findsOneWidget,
      );
      expect(find.text('ऑफ़लाइन उपलब्ध'), findsOneWidget);
    },
  );

  testWidgets('route locations populate both dropdowns on a small screen', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    Uri? requestedUri;
    final client = MockClient((request) async {
      requestedUri = request.url;
      return http.Response(
        jsonEncode({
          'nodes': {
            'N_SHIVAJINAGAR': {
              'id': 'N_SHIVAJINAGAR',
              'name': 'Shivajinagar Junction',
              'lat': 18.5314,
              'lng': 73.8446,
              'elevationM': 560,
            },
            'N_SWARGATE': {
              'id': 'N_SWARGATE',
              'name': 'Swargate Junction',
              'lat': 18.5018,
              'lng': 73.858,
              'elevationM': 559,
            },
          },
          'segments': [],
        }),
        200,
      );
    });

    await tester.pumpWidget(
      _localizedApp(home: SafeRoutePlannerScreen(client: client)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Shivajinagar Junction'), findsOneWidget);
    expect(find.text('Swargate Junction'), findsOneWidget);
    final expectedBaseUrl = configuredApiBaseUrl.isEmpty
        ? 'http://192.168.0.104:3000'
        : configuredApiBaseUrl.replaceFirst(RegExp(r'/$'), '');
    expect(requestedUri, Uri.parse('$expectedBaseUrl/api/roads'));
    expect(find.text('Backend: $expectedBaseUrl'), findsOneWidget);

    final dropdowns = tester.widgetList<DropdownButton<String>>(
      find.byType(DropdownButton<String>),
    );
    expect(dropdowns, hasLength(2));
    expect(
      dropdowns.first.items!.map((item) => item.value),
      containsAll(['N_SHIVAJINAGAR', 'N_SWARGATE']),
    );
  });

  testWidgets('route preference chips render the matching backend route', (
    WidgetTester tester,
  ) async {
    final startNode = {
      'id': 'N_A',
      'name': 'Point A',
      'lat': 18.5,
      'lng': 73.8,
      'elevationM': 560,
    };
    final endNode = {
      'id': 'N_B',
      'name': 'Point B',
      'lat': 18.6,
      'lng': 73.9,
      'elevationM': 559,
    };

    Map<String, dynamic> route({
      required String mode,
      required double distance,
      required int risk,
      required String road,
    }) => {
      'mode': mode,
      'feasible': true,
      'nodeIds': ['N_A', 'N_B'],
      'nodes': [startNode, endNode],
      'edges': [
        {
          'id': 'R_$mode',
          'name': road,
          'distanceKm': distance,
          'riskScore': risk,
          'status': 'OPEN',
        },
      ],
      'totalDistanceKm': distance,
      'travelTimeMins': 8.0,
      'averageRiskScore': risk,
      'maxRiskScore': risk,
      'safetyRating': 'Moderate Risk',
    };

    final client = MockClient((request) async {
      if (request.url.path == '/api/roads') {
        return http.Response(
          jsonEncode({
            'nodes': {'N_A': startNode, 'N_B': endNode},
            'segments': [],
          }),
          200,
        );
      }
      if (request.url.path == '/api/routes/find') {
        return http.Response(
          jsonEncode({
            'originNode': startNode,
            'targetNode': endNode,
            'lambdaRisk': 1.5,
            'shortest': route(
              mode: 'shortest',
              distance: 2.4,
              risk: 42,
              road: 'Shortest Road',
            ),
            'fastest': route(
              mode: 'fastest',
              distance: 2.6,
              risk: 48,
              road: 'Fastest Road',
            ),
            'safest': route(
              mode: 'safest',
              distance: 3.2,
              risk: 20,
              road: 'Safest Road',
            ),
            'alternatives': [],
          }),
          200,
        );
      }
      return http.Response('Not found', 404);
    });

    await tester.pumpWidget(
      _localizedApp(home: SafeRoutePlannerScreen(client: client)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    final findRouteButton = find.text('Find Safe Route');
    await tester.ensureVisible(findRouteButton);
    await tester.tap(findRouteButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Safest route details'), findsOneWidget);
    expect(find.text('3.20 km'), findsOneWidget);
    expect(find.textContaining('Safest Road'), findsOneWidget);

    final shortestChip = find.text('Shortest Route').first;
    await tester.ensureVisible(shortestChip);
    await tester.tap(shortestChip);
    await tester.pump();

    expect(find.text('Shortest route details'), findsOneWidget);
    expect(find.text('2.40 km'), findsOneWidget);
    expect(find.textContaining('Shortest Road'), findsOneWidget);
  });

  testWidgets('GPS selects the nearest road node without auto-routing', (
    WidgetTester tester,
  ) async {
    final startNode = {
      'id': 'N_A',
      'name': 'Point A',
      'lat': 18.5,
      'lng': 73.8,
    };
    final nearestNode = {
      'id': 'N_B',
      'name': 'Point B',
      'lat': 18.51,
      'lng': 73.81,
    };
    String? requestedStartNodeId;
    var routeRequests = 0;
    final route = {
      'feasible': true,
      'nodes': [nearestNode, startNode],
      'edges': [],
      'totalDistanceKm': 2.0,
      'travelTimeMins': 10.0,
      'averageRiskScore': 20.0,
      'maxRiskScore': 20.0,
      'safetyRating': 'Safe',
    };
    final client = MockClient((request) async {
      if (request.url.path == '/api/roads') {
        return http.Response(
          jsonEncode({
            'nodes': {'N_B': nearestNode, 'N_A': startNode},
            'segments': [],
          }),
          200,
        );
      }
      if (request.url.path == '/api/routes/find') {
        routeRequests++;
        requestedStartNodeId =
            (jsonDecode(request.body) as Map<String, dynamic>)['startNodeId']
                as String;
        return http.Response(
          jsonEncode({'shortest': route, 'safest': route}),
          200,
        );
      }
      return http.Response('Not found', 404);
    });

    await tester.pumpWidget(
      _localizedApp(
        home: SafeRoutePlannerScreen(
          client: client,
          locationService: _FakeLocationService(
            () async => _testPosition(18.5101, 73.8101),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    final locationButton = find.text('Use My Current Location');
    await tester.ensureVisible(locationButton);
    await tester.tap(locationButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.textContaining('Detected GPS location: 18.51010, 73.81010'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Selected starting node: Point B'),
      findsOneWidget,
    );
    expect(routeRequests, 0);

    await tester.tap(find.text('Find Safe Route'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(routeRequests, 1);
    expect(requestedStartNodeId, 'N_B');
  });

  testWidgets('GPS outside the road network does not select a node', (
    WidgetTester tester,
  ) async {
    final client = MockClient((request) async {
      if (request.url.path == '/api/roads') {
        return http.Response(
          jsonEncode({
            'nodes': {
              'N_A': {'id': 'N_A', 'name': 'Point A', 'lat': 18.5, 'lng': 73.8},
              'N_B': {
                'id': 'N_B',
                'name': 'Point B',
                'lat': 18.51,
                'lng': 73.81,
              },
            },
            'segments': [],
          }),
          200,
        );
      }
      return http.Response('Unexpected route request', 500);
    });

    await tester.pumpWidget(
      _localizedApp(
        home: SafeRoutePlannerScreen(
          client: client,
          locationService: _FakeLocationService(
            () async => _testPosition(19.5, 74.8),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    final locationButton = find.text('Use My Current Location');
    await tester.ensureVisible(locationButton);
    await tester.tap(locationButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.textContaining('Outside the available Pune road network'),
      findsOneWidget,
    );
    expect(
      find.textContaining('No starting node was selected.'),
      findsOneWidget,
    );
    final findRouteButton = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Find Safe Route'),
    );
    expect(findRouteButton.onPressed, isNull);
  });

  testWidgets('GPS permission or service errors are shown in the planner', (
    WidgetTester tester,
  ) async {
    final client = MockClient(
      (_) async => http.Response(
        jsonEncode({
          'nodes': {
            'N_A': {'name': 'Point A', 'lat': 18.5, 'lng': 73.8},
            'N_B': {'name': 'Point B', 'lat': 18.51, 'lng': 73.81},
          },
          'segments': [],
        }),
        200,
      ),
    );

    await tester.pumpWidget(
      _localizedApp(
        home: SafeRoutePlannerScreen(
          client: client,
          locationService: _FakeLocationService(
            () => Future<Position>.error(
              const LocationException(
                'Location permission was denied. You can still choose a mapped location.',
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    final locationButton = find.text('Use My Current Location');
    await tester.ensureVisible(locationButton);
    await tester.tap(locationButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.textContaining('Location permission was denied'),
      findsOneWidget,
    );
  });

  testWidgets('road API errors are visible beside the location controls', (
    WidgetTester tester,
  ) async {
    final client = MockClient(
      (_) async => http.Response('Server unavailable', 503),
    );

    await tester.pumpWidget(
      _localizedApp(home: SafeRoutePlannerScreen(client: client)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.textContaining('The requested data is unavailable.'),
      findsOneWidget,
    );
    expect(find.text('Retry loading locations'), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
  });

  testWidgets('an empty roads response shows an empty state and retry', (
    WidgetTester tester,
  ) async {
    final client = MockClient(
      (_) async =>
          http.Response(jsonEncode({'nodes': {}, 'segments': []}), 200),
    );

    await tester.pumpWidget(
      _localizedApp(home: SafeRoutePlannerScreen(client: client)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      find.text('No road locations are currently available.'),
      findsOneWidget,
    );
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
  });
}

MaterialApp _localizedApp({required Widget home, String locale = 'en'}) =>
    MaterialApp(
      locale: Locale(locale),
      localizationsDelegates: AppLocalizationSupport.delegates,
      supportedLocales: AppLocalizationSupport.supportedLocales,
      home: home,
    );

ApiService _mockApi() => ApiService(
  client: MockClient((request) async {
    if (request.url.path == '/api/auth/me') {
      return http.Response(
        jsonEncode({
          'success': true,
          'user': {
            'id': 'USR_CITIZEN_1',
            'fullName': 'Citizen User',
            'email': 'citizen@example.test',
            'role': 'CITIZEN',
          },
        }),
        200,
      );
    }
    if (request.url.path == '/api/health') {
      return http.Response(jsonEncode({'status': 'ok'}), 200);
    }
    if (request.url.path == '/api/roads') {
      return http.Response(jsonEncode({'nodes': {}, 'segments': []}), 200);
    }
    return http.Response('[]', 200);
  }),
);

ApiService _mapPreviewApi({Duration timestampAge = Duration.zero}) =>
    ApiService(
      client: MockClient((request) async {
        if (request.url.path == '/api/roads') {
          return http.Response(
            jsonEncode({
              'nodes': {
                'P1': {'name': 'Pune Road Node', 'lat': 18.5, 'lng': 73.8},
              },
              'segments': [
                {
                  'id': 'R1',
                  'name': 'Pune Road',
                  'from': 'P1',
                  'to': 'P2',
                  'distanceKm': 1.2,
                  'riskScore': 72,
                  'status': 'caution',
                  'coordinates': [
                    [18.5, 73.8],
                    [18.51, 73.81],
                  ],
                  'lastUpdated': DateTime.now()
                      .subtract(timestampAge)
                      .toIso8601String(),
                },
              ],
            }),
            200,
          );
        }
        return http.Response('[]', 200);
      }),
    );

Position _testPosition(double latitude, double longitude) => Position(
  latitude: latitude,
  longitude: longitude,
  timestamp: DateTime.now(),
  accuracy: 5,
  altitude: 0,
  altitudeAccuracy: 0,
  heading: 0,
  headingAccuracy: 0,
  speed: 0,
  speedAccuracy: 0,
);

class _FakeLocationService extends LocationService {
  _FakeLocationService(this._getCurrentPosition, {this.existingPosition});

  final Future<Position> Function() _getCurrentPosition;
  final Position? existingPosition;

  @override
  Future<Position> getCurrentPosition() => _getCurrentPosition();

  @override
  Future<Position?> getCurrentPositionIfPermissionGranted() async =>
      existingPosition;
}

class _TestStorage extends AppStorage {
  _TestStorage({this.token = 'saved-citizen-token'});

  String? token;
  bool guestMode = false;
  String language = 'en';

  @override
  Future<String?> readToken() async => token;

  @override
  Future<String> readLanguage() async => language;

  @override
  Future<void> writeToken(String token) async => this.token = token;

  @override
  Future<void> clearToken() async => token = null;

  @override
  Future<bool> readGuestMode() async => guestMode;

  @override
  Future<void> writeGuestMode(bool isGuest) async {
    guestMode = isGuest;
    if (isGuest) token = null;
  }

  @override
  Future<void> writeLanguage(String language) async {
    this.language = language;
  }

  @override
  Future<List<SavedItem>> readSavedItems() async => [];

  @override
  Future<void> saveItem(SavedItem item) async {}

  @override
  Future<void> removeItem(String id) async {}
}
