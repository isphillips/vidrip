import { createNavigationContainerRef } from '@react-navigation/native';

// Shared navigation ref. Root-level overlays (e.g. FriendsMenuOverlay) live OUTSIDE any screen, so
// they can't use useNavigation() — they navigate through this ref instead. Also used by the push
// notification handlers in RootNavigator. Assigned via <NavigationContainer ref={navigationRef}>.
export const navigationRef = createNavigationContainerRef<any>();
