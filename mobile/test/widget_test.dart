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
