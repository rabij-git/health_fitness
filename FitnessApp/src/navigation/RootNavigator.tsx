import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { UserRole } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { getProfile } from '../lib/db';
import { colors } from '../theme/colors';
import LoginScreen from '../screens/LoginScreen';
import AdminTabs from './AdminTabs';
import CoachTabs from './CoachTabs';
import TrainerTabs from './TrainerTabs';

export default function RootNavigator() {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on app launch
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        getProfile(session.user.id).then(profile => {
          if (profile) {
            setUserRole(profile.role as UserRole);
            setUserId(session.user.id);
          }
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes (sign in / sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUserRole(null);
        setUserId(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (role: UserRole, uid: string) => {
    setUserRole(role);
    setUserId(uid);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserRole(null);
    setUserId(null);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!userRole || !userId) {
    return (
      <NavigationContainer>
        <LoginScreen onLogin={handleLogin} />
      </NavigationContainer>
    );
  }

  if (userRole === 'admin') {
    return (
      <NavigationContainer>
        <AdminTabs onLogout={handleLogout} />
      </NavigationContainer>
    );
  }

  if (userRole === 'coach') {
    return (
      <NavigationContainer>
        <CoachTabs onLogout={handleLogout} userId={userId} />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <TrainerTabs onLogout={handleLogout} userId={userId} />
    </NavigationContainer>
  );
}
