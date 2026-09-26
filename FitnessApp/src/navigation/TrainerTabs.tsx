import React, { useRef } from 'react';
import { ScrollView } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import TrainerDashboard from '../screens/trainer/TrainerDashboard';
import WorkoutTabScreen from '../screens/trainer/WorkoutTabScreen';
import GamificationScreen from '../screens/trainer/GamificationScreen';
import SocialScreen from '../screens/trainer/SocialScreen';
import ProfileScreen from '../screens/trainer/ProfileScreen';
import FoodLogScreen from '../screens/trainer/FoodLogScreen';

const Tab = createBottomTabNavigator();

interface Props {
  onLogout: () => void;
  userId: string;
}

export default function TrainerTabs({ onLogout, userId }: Props) {
  const insets = useSafeAreaInsets();
  // Double-tap-to-top: tapping the Home tab while it's already focused
  // scrolls the Home screen back to the top instead of doing nothing.
  const homeScrollRef = useRef<ScrollView>(null);
  return (
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
  );
}
