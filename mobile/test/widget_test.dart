import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sankatsetu/models/app_models.dart';
import 'package:sankatsetu/main.dart';
import 'package:sankatsetu/screens/home_screen.dart';
import 'package:sankatsetu/screens/offline_guide_screen.dart';
import 'package:sankatsetu/screens/safe_route_planner.dart';
import 'package:sankatsetu/services/api_service.dart';
import 'package:sankatsetu/services/app_storage.dart';

const configuredApiBaseUrl = String.fromEnvironment('SANKATSETU_API_BASE_URL');

void main() {
  testWidgets('SankatSetu dashboard loads', (WidgetTester tester) async {
    final api = _mockApi();
    await tester.pumpWidget(SankatSetuApp(api: api, storage: _TestStorage()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('SankatSetu'), findsOneWidget);
    expect(find.text('Your safety, our priority'), findsOneWidget);
    expect(find.text('Safe Route Planner'), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('Home feature cards and sign-in open their destination screens', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      SankatSetuApp(api: _mockApi(), storage: _TestStorage()),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    const destinations = [
      ('Emergency', 'Emergency'),
      ('Safe Route Planner', 'Safe Route Planner'),
      ('Reports', 'Community incidents'),
      ('Flood Alerts', 'Flood alerts'),
      ('Risk Map', 'Flood risk map'),
      ('Offline Emergency Guide', 'Offline Emergency Guide'),
      ('Emergency Assistant', 'Emergency assistant'),
      ('Saved Information', 'Saved information'),
    ];

    for (final (cardTitle, screenTitle) in destinations) {
      final home = find.byType(HomeScreen);
      final card = find.descendant(of: home, matching: find.text(cardTitle));
      await tester.scrollUntilVisible(
        card,
        250,
        scrollable: find
            .descendant(of: home, matching: find.byType(Scrollable))
            .first,
      );
      await tester.tap(card);
      await tester.pumpAndSettle();
      expect(
        find.text(screenTitle),
        findsOneWidget,
        reason: '$cardTitle navigation',
      );
      await tester.pageBack();
      await tester.pumpAndSettle();
    }

    final home = find.byType(HomeScreen);
    final signIn = find.descendant(
      of: home,
      matching: find.text('Sign in / Register'),
    );
    await tester.scrollUntilVisible(
      signIn,
      250,
      scrollable: find
          .descendant(of: home, matching: find.byType(Scrollable))
          .first,
    );
    await tester.tap(signIn);
    await tester.pumpAndSettle();
    expect(find.text('Citizen sign in'), findsOneWidget);
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
        const MaterialApp(home: OfflineGuideScreen(language: 'hi')),
      );

      expect(find.text('ऑफ़लाइन आपातकालीन मार्गदर्शिका'), findsOneWidget);
      expect(
        find.textContaining('बाढ़ के पानी में पैदल न चलें'),
        findsOneWidget,
      );
      expect(find.text('Available offline'), findsOneWidget);
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
      MaterialApp(home: SafeRoutePlannerScreen(client: client)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Shivajinagar Junction'), findsOneWidget);
    expect(find.text('Swargate Junction'), findsOneWidget);
    final expectedBaseUrl = configuredApiBaseUrl.isEmpty
        ? 'http://10.0.2.2:3000'
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
      MaterialApp(home: SafeRoutePlannerScreen(client: client)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    final findRouteButton = find.text('Find Safe Route');
    await tester.ensureVisible(findRouteButton);
    await tester.tap(findRouteButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Safest Route Details'), findsOneWidget);
    expect(find.text('3.20 km'), findsOneWidget);
    expect(find.textContaining('Safest Road'), findsOneWidget);

    final shortestChip = find.text('Shortest Route').first;
    await tester.ensureVisible(shortestChip);
    await tester.tap(shortestChip);
    await tester.pump();

    expect(find.text('Shortest Route Details'), findsOneWidget);
    expect(find.text('2.40 km'), findsOneWidget);
    expect(find.textContaining('Shortest Road'), findsOneWidget);
  });

  testWidgets('road API errors are visible beside the location controls', (
    WidgetTester tester,
  ) async {
    final client = MockClient(
      (_) async => http.Response('Server unavailable', 503),
    );

    await tester.pumpWidget(
      MaterialApp(home: SafeRoutePlannerScreen(client: client)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('Unable to load locations'), findsOneWidget);
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
      MaterialApp(home: SafeRoutePlannerScreen(client: client)),
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

ApiService _mockApi() => ApiService(
  client: MockClient((request) async {
    if (request.url.path == '/api/health') {
      return http.Response(jsonEncode({'status': 'ok'}), 200);
    }
    if (request.url.path == '/api/roads') {
      return http.Response(jsonEncode({'nodes': {}, 'segments': []}), 200);
    }
    return http.Response('[]', 200);
  }),
);

class _TestStorage extends AppStorage {
  @override
  Future<String?> readToken() async => null;

  @override
  Future<String> readLanguage() async => 'en';

  @override
  Future<void> writeToken(String token) async {}

  @override
  Future<void> clearToken() async {}

  @override
  Future<void> writeLanguage(String language) async {}

  @override
  Future<List<SavedItem>> readSavedItems() async => [];

  @override
  Future<void> saveItem(SavedItem item) async {}

  @override
  Future<void> removeItem(String id) async {}
}
