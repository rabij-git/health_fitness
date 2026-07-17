import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import AdminDashboard from '../screens/admin/AdminDashboard';
import AdminUsers from '../screens/admin/AdminUsers';
import AdminSettings from '../screens/admin/AdminSettings';

const Tab = createBottomTabNavigator();

interface Props {
  onLogout: () => void;
}

export default function AdminTabs({ onLogout }: Props) {
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
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, { focused: string; unfocused: string }> = {
            Dashboard: { focused: 'grid', unfocused: 'grid-outline' },
            Users: { focused: 'people', unfocused: 'people-outline' },
            Settings: { focused: 'settings', unfocused: 'settings-outline' },
          };
          const iconSet = icons[route.name];
          const iconName = focused ? iconSet?.focused : iconSet?.unfocused;
          return <Ionicons name={(iconName || 'grid-outline') as any} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard">
        {() => <AdminDashboard onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen name="Users" component={AdminUsers} />
      <Tab.Screen name="Settings">
        {() => <AdminSettings onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}