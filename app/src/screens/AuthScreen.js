// ============================================================
//  Auth Screen — Login & Register
//  Dark Messenger / Light WhatsApp style
// ============================================================
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Animated,
  ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { signIn, signUp } from '../services/supabase';

const { width, height } = Dimensions.get('window');

export default function AuthScreen() {
  const { theme, isDark } = useTheme();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState({});

  const s = makeStyles(theme);

  function switchMode(newMode) {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      setMode(newMode);
      setErrors({});
    }, 150);
  }

  function validate() {
    const newErrors = {};
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Min 6 characters';
    if (mode === 'register') {
      if (!username.trim()) newErrors.username = 'Username is required';
      else if (username.length < 3) newErrors.username = 'Min 3 characters';
      else if (!/^[a-zA-Z0-9_]+$/.test(username)) newErrors.username = 'Only letters, numbers, underscores';
      if (!displayName.trim()) newErrors.displayName = 'Display name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function showAlert(title, message) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function handleSubmit() {
    if (!validate()) return;
    setIsLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn({ email: email.trim(), password });
        if (error) showAlert('Login Failed', error.message);
      } else {
        const { error } = await signUp({
          email: email.trim(),
          password,
          username: username.trim().toLowerCase(),
          displayName: displayName.trim(),
        });
        if (error) showAlert('Registration Failed', error.message);
        else showAlert('Success! 🎉', 'Check your email to confirm your account, then login.');
      }
    } catch (e) {
      console.error('Auth Error:', e);
      showAlert('Error', e.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={[s.container, { backgroundColor: theme.colors.background }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={isDark
          ? ['#1A1A2E', '#16213E', '#0F0F13']
          : ['#EEF2FF', '#E0E7FF', '#F8FAFC']}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo / Header */}
          <View style={s.header}>
            <View style={s.logoWrap}>
              <LinearGradient
                colors={['#6366F1', '#8B5CF6']}
                style={s.logo}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="chatbubbles" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={[s.appName, { color: theme.colors.text }]}>Hybrid Engine</Text>
            <Text style={[s.tagline, { color: theme.colors.textSecondary }]}>
              Zero-cost • Zero-trace • P2P Chat
            </Text>
          </View>

          {/* Form Card */}
          <Animated.View style={[s.card, { backgroundColor: theme.colors.card, opacity: fadeAnim }]}>
            {/* Tab Switch */}
            <View style={[s.tabRow, { backgroundColor: theme.colors.surfaceAlt }]}>
              {['login', 'register'].map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[s.tab, mode === tab && { backgroundColor: theme.colors.primary }]}
                  onPress={() => switchMode(tab)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.tabText, { color: mode === tab ? '#fff' : theme.colors.textSecondary }]}>
                    {tab === 'login' ? 'Sign In' : 'Create Account'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.form}>
              {/* Register-only fields */}
              {mode === 'register' && (
                <>
                  <InputField
                    label="Display Name"
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Your name"
                    icon="person-outline"
                    error={errors.displayName}
                    theme={theme}
                  />
                  <InputField
                    label="Username"
                    value={username}
                    onChangeText={(t) => setUsername(t.toLowerCase())}
                    placeholder="username (letters, numbers, _)"
                    icon="at-outline"
                    error={errors.username}
                    theme={theme}
                    autoCapitalize="none"
                  />
                </>
              )}

              {/* Email */}
              <InputField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                icon="mail-outline"
                error={errors.email}
                theme={theme}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {/* Password */}
              <InputField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Min 6 characters"
                icon="lock-closed-outline"
                error={errors.password}
                theme={theme}
                secureTextEntry={!showPassword}
                rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onRightIconPress={() => setShowPassword(!showPassword)}
              />

              {/* Submit Button */}
              <TouchableOpacity
                style={[s.submitBtn, isLoading && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#6366F1', '#8B5CF6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.submitGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.submitText}>
                      {mode === 'login' ? 'Sign In' : 'Create Account'}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Footer */}
          <Text style={[s.footer, { color: theme.colors.textMuted }]}>
            🔒 End-to-end encrypted • No server storage
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Input Field Component ──
function InputField({
  label, value, onChangeText, placeholder, icon, error, theme,
  secureTextEntry, rightIcon, onRightIconPress, keyboardType, autoCapitalize,
}) {
  const [focused, setFocused] = useState(false);
  const s = makeInputStyles(theme);

  return (
    <View style={s.wrap}>
      <Text style={[s.label, { color: theme.colors.textSecondary }]}>{label}</Text>
      <View style={[
        s.inputWrap,
        { backgroundColor: theme.colors.inputBg, borderColor: error ? theme.colors.error : focused ? theme.colors.primary : theme.colors.inputBorder },
      ]}>
        <Ionicons name={icon} size={18} color={focused ? theme.colors.primary : theme.colors.textMuted} style={s.icon} />
        <TextInput
          style={[s.input, { color: theme.colors.inputText }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.placeholder}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={autoCapitalize || 'words'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} style={s.rightIcon}>
            <Ionicons name={rightIcon} size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={[s.error, { color: theme.colors.error }]}>{error}</Text>}
    </View>
  );
}

function makeStyles(theme) {
  const t = theme.colors;
  return StyleSheet.create({
    container: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 24,
      paddingTop: 60,
    },
    header: { alignItems: 'center', marginBottom: 32 },
    logoWrap: {
      shadowColor: '#6366F1',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 12,
      marginBottom: 16,
    },
    logo: {
      width: 80, height: 80,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    appName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
    tagline: { fontSize: 13 },
    card: {
      borderRadius: 24,
      padding: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    },
    tabRow: {
      flexDirection: 'row',
      borderRadius: 12,
      padding: 4,
      marginBottom: 24,
    },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    tabText: { fontSize: 14, fontWeight: '600' },
    form: { gap: 4 },
    submitBtn: { marginTop: 12 },
    submitGradient: {
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    footer: { textAlign: 'center', marginTop: 24, fontSize: 12 },
  });
}

function makeInputStyles(theme) {
  return StyleSheet.create({
    wrap: { marginBottom: 12 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1.5,
      paddingHorizontal: 12,
    },
    icon: { marginRight: 8 },
    input: { flex: 1, fontSize: 15, paddingVertical: 13 },
    rightIcon: { padding: 4 },
    error: { fontSize: 12, marginTop: 4, marginLeft: 2 },
  });
}
