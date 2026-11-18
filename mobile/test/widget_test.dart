import 'package:flutter_test/flutter_test.dart';
import 'package:sankatsetu/main.dart';

void main() {
  testWidgets('SankatSetu dashboard loads', (WidgetTester tester) async {
    await tester.pumpWidget(const SankatSetuApp());

    expect(find.text('SankatSetu'), findsOneWidget);
    expect(find.text('Emergency Services'), findsOneWidget);
    expect(find.text('Safe Route Planner'), findsOneWidget);
  });
}
