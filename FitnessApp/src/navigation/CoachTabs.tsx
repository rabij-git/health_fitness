import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import CoachDashboard from '../screens/coach/CoachDashboard';
import CoachPrograms from '../screens/coach/CoachPrograms';
import CoachTrainees from '../screens/coach/CoachTrainees';
import CoachRankings from '../screens/coach/CoachRankings';
import CoachSettings from '../screens/coach/CoachSettings';

const Tab = createBottomTabNavigator();

interface Props {
  onLogout: () => void;
  userId: string;
}

export default function CoachTabs({ onLogout, userId }: Props) {
  const insets = useSafeAreaInsets();
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
            Dashboard: { focused: 'home', unfocused: 'home-outline' },
            Programs: { focused: 'barbell', unfocused: 'barbell-outline' },
            Trainees: { focused: 'people', unfocused: 'people-outline' },
            Rankings: { focused: 'trophy', unfocused: 'trophy-outline' },
            Settings: { focused: 'settings', unfocused: 'settings-outline' },
          };
          const iconSet = icons[route.name];
          const iconName = focused ? iconSet?.focused : iconSet?.unfocused;
          return <Ionicons name={(iconName || 'home-outline') as any} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard">
        {({ navigation }) => <CoachDashboard onLogout={onLogout} coachId={userId} navigation={navigation} />}
      </Tab.Screen>
      <Tab.Screen name="Programs">
        {() => <CoachPrograms coachId={userId} />}
      </Tab.Screen>
      <Tab.Screen name="Trainees">
        {() => <CoachTrainees coachId={userId} />}
      </Tab.Screen>
      <Tab.Screen name="Rankings">
        {() => <CoachRankings coachId={userId} />}
      </Tab.Screen>
      <Tab.Screen name="Settings">
        {() => <CoachSettings onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
