// ============================================================
//  App.js — Root Navigation & Provider Setup
// ============================================================
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar, ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

// Providers
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';

// Screens
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ChatScreen from './src/screens/ChatScreen';
import CallScreen from './src/screens/CallScreen';
import IncomingCallScreen from './src/screens/IncomingCallScreen';
import GroupCallScreen from './src/screens/GroupCallScreen';
import AdminScreen from './src/screens/AdminScreen';

// Notifications
import { addNotificationResponseListener, addNotificationReceivedListener } from './src/services/notifications';
import * as socketService from './src/services/socket';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ──────────────────────────────────────────────
//  Bottom Tab Navigator
// ──────────────────────────────────────────────
function MainTabs() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const t = theme.colors;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: t.tabBg,
          borderTopColor: t.headerBorder,
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: t.tabActive,
        tabBarInactiveTintColor: t.tabInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color }) => {
          const icons = {
            Chats: focused ? 'chatbubbles' : 'chatbubbles-outline',
            Search: focused ? 'search' : 'search-outline',
            Profile: focused ? 'person' : 'person-outline',
            Admin: focused ? 'shield' : 'shield-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse'} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Chats" component={HomeScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      {profile?.role === 'admin' && (
        <Tab.Screen name="Admin" component={AdminScreen} />
      )}
    </Tab.Navigator>
  );
}

// ──────────────────────────────────────────────
//  Main Stack Navigator
// ──────────────────────────────────────────────
function AppNavigator() {
  const { theme } = useTheme();
  const { user, isLoading, profile } = useAuth();

  // Handle notification responses (when user taps a notification)
  useEffect(() => {
    const subscription = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'incoming_call') {
        // Navigation to incoming call handled via socket events
        console.log('[App] Notification response — incoming call from:', data.callerId);
      }
    });
    return () => subscription.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar
        barStyle={theme.colors.statusBar}
        backgroundColor={theme.colors.headerBg}
      />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen
              name="Call"
              component={CallScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="IncomingCall"
              component={IncomingCallScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="GroupCall"
              component={GroupCallScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ──────────────────────────────────────────────
//  Root App
// ──────────────────────────────────────────────
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
