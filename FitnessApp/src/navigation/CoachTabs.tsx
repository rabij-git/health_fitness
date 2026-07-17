import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import CoachDashboard from '../screens/coach/CoachDashboard';
import CoachPrograms from '../screens/coach/CoachPrograms';
import CoachRankings from '../screens/coach/CoachRankings';
import CoachSettings from '../screens/coach/CoachSettings';

const Tab = createBottomTabNavigator();

interface Props {
  onLogout: () => void;
  userId: string;
}

export default function CoachTabs({ onLogout, userId }: Props) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color }) => {
          const icons: Record<string, { focused: string; unfocused: string }> = {
            Dashboard: { focused: 'home', unfocused: 'home-outline' },
            Programs: { focused: 'barbell', unfocused: 'barbell-outline' },
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
        {() => <CoachDashboard onLogout={onLogout} coachId={userId} />}
      </Tab.Screen>
      <Tab.Screen name="Programs">
        {() => <CoachPrograms coachId={userId} />}
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
