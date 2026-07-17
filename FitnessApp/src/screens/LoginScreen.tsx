import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { UserRole } from '../data/mockData';
import { signIn, signUp, getProfile } from '../lib/db';

interface Props {
  onLogin: (role: UserRole, userId: string) => void;
}

type Tab = 'signin' | 'signup';
type SignUpRole = 'coach' | 'trainee';

export default function LoginScreen({ onLogin }: Props) {
  const [tab, setTab] = useState<Tab>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sign in
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Sign up
  const [suName, setSuName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [suRole, setSuRole] = useState<SignUpRole>('trainee');
  const [showSuPass, setShowSuPass] = useState(false);
  const [signedUpMsg, setSignedUpMsg] = useState('');

  const clearError = () => setError('');

  const handleSignIn = async () => {
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    setError('');
    try {
      const { user } = await signIn(email.trim().toLowerCase(), password);
      if (!user) throw new Error('No user returned');
      const profile = await getProfile(user.id);
      if (!profile) throw new Error('Profile not found');
      onLogin(profile.role as UserRole, user.id);
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!suName.trim()) { setError('Please enter your full name.'); return; }
    if (!suEmail.trim()) { setError('Please enter your email.'); return; }
    if (suPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (suPassword !== suConfirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      await signUp(suEmail.trim().toLowerCase(), suPassword, suName.trim(), suRole);
      setSignedUpMsg(
        suRole === 'trainee'
          ? 'Account created! Check your email to confirm, then sign in. Your coach will assign your program.'
          : 'Account created! Check your email to confirm, then sign in.'
      );
    } catch (e: any) {
      // Supabase error messages are user-friendly enough
      setError(e.message ?? 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <Ionicons name="barbell" size={40} color={colors.primary} />
            </View>
            <Text style={styles.appName}>FitPro</Text>
            <Text style={styles.tagline}>Elite Performance Platform</Text>
          </View>

          {/* Tab switcher */}
          <View style={styles.tabSwitcher}>
            {(['signin', 'signup'] as Tab[]).map(t => (
              <TouchableOpacity
                key={t}
                style={styles.tabButton}
                onPress={() => { setTab(t); clearError(); setSignedUpMsg(''); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabButtonText, tab === t && styles.tabButtonTextActive]}>
                  {t === 'signin' ? 'Sign In' : 'Sign Up'}
                </Text>
                {tab === t && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Error banner */}
          {!!error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={colors.primary} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Success banner */}
          {!!signedUpMsg && (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.successText}>{signedUpMsg}</Text>
            </View>
          )}

          {/* ── SIGN IN ── */}
          {tab === 'signin' && (
            <View style={styles.form}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={v => { setEmail(v); clearError(); }}
                placeholder="you@fitpro.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>PASSWORD</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={password}
                  onChangeText={v => { setPassword(v); clearError(); }}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(p => !p)}>
                  <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnLoading]}
                onPress={handleSignIn}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={colors.text} />
                  : <>
                      <Text style={styles.primaryBtnText}>Sign In</Text>
                      <Ionicons name="arrow-forward" size={20} color={colors.text} />
                    </>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ── SIGN UP ── */}
          {tab === 'signup' && !signedUpMsg && (
            <View style={styles.form}>
              {/* Role toggle */}
              <Text style={styles.fieldLabel}>I AM A</Text>
              <View style={styles.roleToggle}>
                {(['trainee', 'coach'] as SignUpRole[]).map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleChip, suRole === r && styles.roleChipActive]}
                    onPress={() => setSuRole(r)}
                  >
                    <Ionicons
                      name={r === 'trainee' ? 'barbell' : 'person-circle'}
                      size={18}
                      color={suRole === r ? colors.text : colors.textSecondary}
                    />
                    <Text style={[styles.roleChipText, suRole === r && styles.roleChipTextActive]}>
                      {r === 'trainee' ? 'Trainee' : 'Coach'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <TextInput
                style={styles.input}
                value={suName}
                onChangeText={v => { setSuName(v); clearError(); }}
                placeholder="e.g. Jordan Lee"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="words"
              />

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={suEmail}
                onChangeText={v => { setSuEmail(v); clearError(); }}
                placeholder="you@fitpro.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>PASSWORD</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={suPassword}
                  onChangeText={v => { setSuPassword(v); clearError(); }}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showSuPass}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowSuPass(p => !p)}>
                  <Ionicons name={showSuPass ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>CONFIRM PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={suConfirm}
                onChangeText={v => { setSuConfirm(v); clearError(); }}
                placeholder="Repeat password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showSuPass}
                autoCapitalize="none"
              />

              {suRole === 'trainee' && (
                <View style={styles.note}>
                  <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
                  <Text style={styles.noteText}>
                    Your coach will find and assign your program once you sign up.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnLoading]}
                onPress={handleSignUp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={colors.text} />
                  : <>
                      <Text style={styles.primaryBtnText}>Create Account</Text>
                      <Ionicons name="arrow-forward" size={20} color={colors.text} />
                    </>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* After successful sign-up */}
          {tab === 'signup' && !!signedUpMsg && (
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 16 }]}
              onPress={() => { setTab('signin'); setSignedUpMsg(''); }}
            >
              <Text style={styles.primaryBtnText}>Go to Sign In</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.text} />
            </TouchableOpacity>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  bgCircle1: {
    position: 'absolute', top: -80, right: -80,
    width: 250, height: 250, borderRadius: 125,
    backgroundColor: colors.primary, opacity: 0.08,
  },
  bgCircle2: {
    position: 'absolute', bottom: -100, left: -60,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: colors.accent, opacity: 0.12,
  },

  logoSection: { alignItems: 'center', marginTop: 64, marginBottom: 28 },
  logoContainer: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 2, borderColor: colors.primary,
  },
  appName: { fontSize: 42, fontWeight: '800', color: colors.text, letterSpacing: 2 },
  tagline: { fontSize: 13, color: colors.textSecondary, marginTop: 4, letterSpacing: 1, textTransform: 'uppercase' },

  tabSwitcher: {
    flexDirection: 'row', marginBottom: 20,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tabButton: { flex: 1, alignItems: 'center', paddingBottom: 12, position: 'relative' },
  tabButtonText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  tabButtonTextActive: { color: colors.text, fontWeight: '700' },
  tabUnderline: {
    position: 'absolute', bottom: -1, left: '20%', right: '20%',
    height: 2, borderRadius: 1, backgroundColor: colors.xpBar,
  },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary + '22', borderRadius: 12,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + '44',
  },
  errorText: { flex: 1, fontSize: 13, color: colors.primary, lineHeight: 18 },
  successBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.success + '22', borderRadius: 12,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.success + '44',
  },
  successText: { flex: 1, fontSize: 13, color: colors.success, lineHeight: 18 },

  form: { gap: 0 },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1.5, marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    color: colors.text, fontSize: 15, borderWidth: 1.5, borderColor: colors.border,
    marginBottom: 4,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 0, marginBottom: 4 },
  eyeBtn: {
    position: 'absolute', right: 14, top: 0, bottom: 0,
    justifyContent: 'center', zIndex: 1,
  },

  roleToggle: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  roleChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
  },
  roleChipActive: { borderColor: colors.xpBar, backgroundColor: '#0a1f1a' },
  roleChipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  roleChipTextActive: { color: colors.xpBar },

  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, marginBottom: 4,
    backgroundColor: colors.accent + '44', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.accent,
  },
  noteText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 24,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 16,
  },
  btnLoading: { opacity: 0.7 },
  primaryBtnText: { fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: 0.5 },
});
