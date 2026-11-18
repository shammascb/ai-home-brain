import 'package:firebase_core/firebase_core.dart';

abstract final class FirebaseConfig {
  static const setupMessage =
      'Firebase Authentication is not connected yet. Firebase is Google’s '
      'service for securely creating and checking accounts. Connect this app '
      'to your Firebase project to enable sign-in. Until then, the app will '
      'not create or accept accounts.';

  static const firestoreDatabaseId =
      'ai-studio-aihomebrain-98663c1f-43eb-4ecf-ab4f-fff5493858df';

  static const webOptions = FirebaseOptions(
    apiKey: 'AIzaSyBT9_Hw16XH7Z63-BOt0wp9ttU7Ag07sZY',
    appId: '1:969254788210:web:7167a0ee0ef7de5c4576eb',
    messagingSenderId: '969254788210',
    projectId: 'ai-home-brain-6df82',
    authDomain: 'ai-home-brain-6df82.firebaseapp.com',
    storageBucket: 'ai-home-brain-6df82.firebasestorage.app',
  );
}
