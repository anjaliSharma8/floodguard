import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sankatsetu/main.dart';
import 'package:sankatsetu/screens/safe_route_planner.dart';

void main() {
  testWidgets('SankatSetu dashboard loads', (WidgetTester tester) async {
    await tester.pumpWidget(const SankatSetuApp());

    expect(find.text('SankatSetu'), findsNothing);
    expect(find.byKey(const ValueKey('home-logo')), findsOneWidget);
    expect(find.text('Emergency actions'), findsOneWidget);
    expect(find.text('Safe Route Planner'), findsOneWidget);
    expect(
      tester
          .widgetList<NavigationDestination>(find.byType(NavigationDestination))
          .where((destination) => destination.label != 'Home')
          .every((destination) => !destination.enabled),
      isTrue,
    );
  });

  testWidgets('Planner action stays visible with keyboard open', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);

    await tester.pumpWidget(const MaterialApp(home: SafeRoutePlannerScreen()));

    final actionBounds = tester.getRect(find.text('Find safe route'));
    expect(actionBounds.top, greaterThanOrEqualTo(0));
    expect(actionBounds.bottom, lessThan(360));
  });
}
