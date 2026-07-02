/**
 * @format
 */

import 'react-native-url-polyfill/auto';
import {AppRegistry, Platform} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// Notifee background handler (Android): must be registered at the top level, outside the component tree.
// Fires when the user taps a Notifee-displayed foreground banner while the app is backgrounded — route
// to the target screen (pushService is required lazily so the headless task stays light).
if (Platform.OS === 'android') {
  const notifee = require('@notifee/react-native').default;
  const {EventType} = require('@notifee/react-native');
  notifee.onBackgroundEvent(async ({type, detail}) => {
    if (type === EventType.PRESS) {
      const {routeNotificationData} = require('./src/infrastructure/notifications/pushService');
      routeNotificationData(detail?.notification?.data);
    }
  });
}

AppRegistry.registerComponent(appName, () => App);
