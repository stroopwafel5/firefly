import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { HomeScreen } from '../screens/home/HomeScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { CampsScreen } from '../screens/camps/CampsScreen';
import { CampPageScreen } from '../screens/camps/CampPageScreen';
import { CampBookingScreen } from '../screens/camps/CampBookingScreen';
import { PayPalScreen } from '../screens/camps/PayPalScreen';
import { GrowScreen } from '../screens/camps/GrowScreen';
import { HealthFormScreen } from '../screens/camps/HealthFormScreen';
import { HealthFormsScreen } from '../screens/camps/HealthFormsScreen';
import { WeekendScreen } from '../screens/weekend/WeekendScreen';
import { AddEventScreen } from '../screens/weekend/AddEventScreen';
import { ChooseTripScreen } from '../screens/planner/ChooseTripScreen';
import { TripPlanScreen } from '../screens/planner/TripPlanScreen';
import { AttractionPageScreen } from '../screens/planner/AttractionPageScreen';
import { UserScreen } from '../screens/user/UserScreen';
import { EditProfileScreen } from '../screens/user/EditProfileScreen';
import { FindPeopleScreen } from '../screens/user/FindPeopleScreen';
import { ChatScreen } from '../screens/user/ChatScreen';
import { NotificationsScreen } from '../screens/user/NotificationsScreen';
import { colors, glowAccent } from '../theme';
import type { RootParams, TabParams } from './types';

const Stack = createNativeStackNavigator<RootParams>();
const Tabs = createBottomTabNavigator<TabParams>();

function MainTabs() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  /** The tab bar is night-coloured like the start screen; each tab lights up in its section colour. */
  const tabBar = {
    headerShown: false,
    tabBarStyle: {
      height: 62 + insets.bottom, // clear of Android's own navigation buttons
      paddingBottom: 8 + insets.bottom,
      backgroundColor: colors.night,
      borderTopColor: '#2A2A55',
    },
    tabBarInactiveTintColor: '#8E8CB8',
  };
  type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  const icon = (name: IconName) => ({ color, size }: { color: string; size: number }) => (
    <MaterialCommunityIcons name={name} color={color} size={size} />
  );
  return (
    <Tabs.Navigator screenOptions={tabBar}>
      <Tabs.Screen name="HomeTab" component={HomeScreen} options={{ title: t('tab.home'), tabBarActiveTintColor: glowAccent.account, tabBarIcon: icon('home-variant') }} />
      <Tabs.Screen name="CampsTab" component={CampsScreen} options={{ title: t('tab.camps'), tabBarActiveTintColor: glowAccent.camps, tabBarIcon: icon('tent') }} />
      <Tabs.Screen name="WeekendTab" component={WeekendScreen} options={{ title: t('tab.weekend'), tabBarActiveTintColor: glowAccent.weekend, tabBarIcon: icon('party-popper') }} />
      <Tabs.Screen name="PlannerTab" component={ChooseTripScreen} options={{ title: t('tab.planner'), tabBarActiveTintColor: glowAccent.planner, tabBarIcon: icon('map-marker-path') }} />
      <Tabs.Screen name="MeTab" component={UserScreen} options={{ title: t('tab.me'), tabBarActiveTintColor: glowAccent.account, tabBarIcon: icon('account-circle') }} />
    </Tabs.Navigator>
  );
}

/**
 * Nobody logged in → the log-in and register pages (with "Continue as guest").
 * Logged in, or a guest → the app, starting on the Home tab. Logging out comes back here.
 */
export function RootNavigator() {
  const { ready, entered } = useAuth();
  if (!ready) {
    // A moment while Firebase reads the saved session, so the log-in page doesn't flash.
    return (
      <View style={{ flex: 1, backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.firefly} />
      </View>
    );
  }
  return (
    <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } }}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {/* navigationKey: when `entered` flips, the other group's screens are dropped, so logging in
            opens the app (and logging out shows the log-in page) even though both groups have SignIn. */}
        {entered ? (
          <Stack.Group navigationKey="app">
            <Stack.Screen name="Tabs" component={MainTabs} />
            <Stack.Screen name="CampPage" component={CampPageScreen} />
            <Stack.Screen name="CampBooking" component={CampBookingScreen} />
            <Stack.Screen name="PayPal" component={PayPalScreen} options={{ headerShown: true, title: 'PayPal' }} />
            <Stack.Screen name="Grow" component={GrowScreen} options={{ headerShown: true, title: 'Grow' }} />
            <Stack.Screen name="HealthForm" component={HealthFormScreen} />
            <Stack.Screen name="HealthForms" component={HealthFormsScreen} />
            <Stack.Screen name="AddEvent" component={AddEventScreen} />
            <Stack.Screen name="TripPlan" component={TripPlanScreen} />
            <Stack.Screen name="Attraction" component={AttractionPageScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true }} />
            <Stack.Screen name="FindPeople" component={FindPeopleScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            {/* A guest can log in or register from inside the app and comes back where they were. */}
            <Stack.Screen name="SignIn" component={LoginScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ animation: 'slide_from_bottom' }} />
          </Stack.Group>
        ) : (
          <Stack.Group navigationKey="auth">
            <Stack.Screen name="SignIn" component={LoginScreen} options={{ animation: 'fade' }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ animation: 'fade' }} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
