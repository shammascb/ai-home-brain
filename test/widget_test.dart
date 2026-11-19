import 'package:flutter_test/flutter_test.dart';

import 'package:ai_home_brain/app/ai_home_brain_app.dart';

void main() {
  testWidgets('AiHomeBrainApp renders AuthScreen when unconfigured',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const AiHomeBrainApp(
        authService: null,
        backendMessage: 'Test backend message',
      ),
    );

    expect(find.text('AI Home Brain'), findsOneWidget);
    expect(find.text('Welcome Back!'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
  });
}
