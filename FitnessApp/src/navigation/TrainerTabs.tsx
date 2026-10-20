import React, { useRef } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { colors } from '../theme/colors';
import TrainerDashboard from '../screens/trainer/TrainerDashboard';
import WorkoutTabScreen from '../screens/trainer/WorkoutTabScreen';
import GamificationScreen from '../screens/trainer/GamificationScreen';
import SocialScreen from '../screens/trainer/SocialScreen';
import ProfileScreen from '../screens/trainer/ProfileScreen';
import FoodLogScreen from '../screens/trainer/FoodLogScreen';
import { ActiveWorkoutProvider } from '../contexts/ActiveWorkoutContext';
import RestTimerBanner from '../components/RestTimerBanner';

const Tab = createBottomTabNavigator();

interface Props {
  onLogout: () => void;
  userId: string;
  navigationRef?: NavigationContainerRefWithCurrent<any>;
}

export default function TrainerTabs({ onLogout, userId, navigationRef }: Props) {
  const insets = useSafeAreaInsets();
  // Double-tap-to-top: tapping the Home tab while it's already focused
  // scrolls the Home screen back to the top instead of doing nothing.
  const homeScrollRef = useRef<ScrollView>(null);
  return (
    <ActiveWorkoutProvider userId={userId}>
      {/* Floats above whichever tab is active, so the rest timer (and its
          double-tap-to-skip) stays visible app-wide, not just on the
          Workout tab — see RestTimerBanner.tsx / ActiveWorkoutContext.tsx.
          Covers the full screen (not just a thin top strip) since the
          banner is now draggable anywhere on it — `pointerEvents="box-none"`
          means this wrapper itself never intercepts touches, only the
          banner's own small area does, so it doesn't block any tab content
          underneath it. */}
      <View style={styles.bannerWrap} pointerEvents="box-none">
        <RestTimerBanner
          onPress={() => navigationRef?.current?.navigate('Workout' as never)}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
      </View>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 54 + insets.bottom,
            paddingBottom: 10 + insets.bottom,
            paddingTop: 8,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarIcon: ({ focused, color }) => {
            const icons: Record<string, { focused: string; unfocused: string }> = {
              Home: { focused: 'home', unfocused: 'home-outline' },
              Workout: { focused: 'barbell', unfocused: 'barbell-outline' },
              Nutrition: { focused: 'restaurant', unfocused: 'restaurant-outline' },
              Medals: { focused: 'trophy', unfocused: 'trophy-outline' },
              Social: { focused: 'people', unfocused: 'people-outline' },
              Profile: { focused: 'person', unfocused: 'person-outline' },
            };
            const iconSet = icons[route.name];
            const iconName = focused ? iconSet?.focused : iconSet?.unfocused;
            return <Ionicons name={(iconName || 'home-outline') as any} size={22} color={color} />;
          },
        })}
      >
        <Tab.Screen
          name="Home"
          listeners={({ navigation }) => ({
            tabPress: () => {
              if (navigation.isFocused()) {
                homeScrollRef.current?.scrollTo({ y: 0, animated: true });
              }
            },
          })}
        >
          {({ navigation }) => (
            <TrainerDashboard onLogout={onLogout} userId={userId} navigation={navigation} scrollRef={homeScrollRef} />
          )}
        </Tab.Screen>
        <Tab.Screen name="Workout">
          {() => <WorkoutTabScreen userId={userId} />}
        </Tab.Screen>
        <Tab.Screen name="Nutrition">
          {() => <FoodLogScreen userId={userId} />}
        </Tab.Screen>
        <Tab.Screen name="Medals">
          {() => <GamificationScreen userId={userId} />}
        </Tab.Screen>
        <Tab.Screen name="Social">
          {() => <SocialScreen userId={userId} />}
        </Tab.Screen>
        <Tab.Screen name="Profile">
          {() => <ProfileScreen onLogout={onLogout} userId={userId} />}
        </Tab.Screen>
      </Tab.Navigator>
    </ActiveWorkoutProvider>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
  },
});
