import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '../store/authStore';

// Auth screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

// App screens
import ConversationsScreen from '../screens/ConversationsScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ChatScreen from '../screens/ChatScreen';
import NewChatScreen from '../screens/NewChatScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/** Bottom tab navigator shown when the user is logged in */
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#075E54' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: '#075E54',
        tabBarInactiveTintColor: '#9E9E9E',
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ConversationsScreen}
        options={{
          title: 'MSG',
          tabBarLabel: 'Chats',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text>,
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          title: 'Contacts',
          tabBarLabel: 'Contacts',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👥</Text>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsPlaceholder}
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

function SettingsPlaceholder() {
  return <Text style={{ flex: 1, textAlign: 'center', marginTop: 40, color: '#9E9E9E' }}>Settings coming soon</Text>;
}

export default function AppNavigator() {
  const { user } = useAuthStore();
  const isLoggedIn = !!user;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#075E54' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          animation: 'slide_from_right',
        }}
      >
        {!isLoggedIn ? (
          // ── Auth stack ─────────────────────────────────────────────────────
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ title: 'Create Account' }}
            />
          </>
        ) : (
          // ── App stack: tabs + modal screens ────────────────────────────────
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ title: '' }}
            />
            <Stack.Screen
              name="NewChat"
              component={NewChatScreen}
              options={{ title: 'New Chat' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
