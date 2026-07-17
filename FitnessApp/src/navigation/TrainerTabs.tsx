import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import TrainerDashboard from '../screens/trainer/TrainerDashboard';
import WorkoutScreen from '../screens/trainer/WorkoutScreen';
import GamificationScreen from '../screens/trainer/GamificationScreen';
import SocialScreen from '../screens/trainer/SocialScreen';
import ProfileScreen from '../screens/trainer/ProfileScreen';
import ExerciseLogScreen from '../screens/trainer/ExerciseLogScreen';

const Tab = createBottomTabNavigator();

interface Props {
  onLogout: () => void;
  userId: string;
}

export default function TrainerTabs({ onLogout, userId }: Props) {
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
            Home: { focused: 'home', unfocused: 'home-outline' },
            Workout: { focused: 'barbell', unfocused: 'barbell-outline' },
            Log: { focused: 'stats-chart', unfocused: 'stats-chart-outline' },
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
      <Tab.Screen name="Home">
        {() => <TrainerDashboard onLogout={onLogout} userId={userId} />}
      </Tab.Screen>
      <Tab.Screen name="Workout">
        {() => <WorkoutScreen userId={userId} />}
      </Tab.Screen>
      <Tab.Screen name="Log">
        {() => <ExerciseLogScreen userId={userId} />}
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
