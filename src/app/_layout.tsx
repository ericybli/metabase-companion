import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AppProviders } from '@/ui/AppProviders';
import { useAuthGate } from '@/auth/useAuthGate';

function Gate() {
  const { ready, route } = useAuthGate();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    const root: string = segments[0] ?? '';
    const onAuthScreen = root === 'setup' || root === 'login' || root === 'unlock';
    if (route === '/(tabs)') {
      // Authenticated: allow any in-app route (tabs, dashboard, card, …).
      // Only redirect away from the auth screens or the empty initial route.
      if (root === '' || onAuthScreen) router.replace('/(tabs)');
    } else if (`/${root}` !== route) {
      // Unauthenticated: force the correct auth screen (/setup | /login | /unlock).
      router.replace(route);
    }
  }, [ready, route, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="setup" />
      <Stack.Screen name="login" />
      <Stack.Screen name="unlock" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <Gate />
    </AppProviders>
  );
}
