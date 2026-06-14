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
    const current = `/${segments.join('/')}`;
    const target = route;
    // Avoid redundant navigation when already on (or under) the target group.
    const onTarget = target === '/(tabs)' ? segments[0] === '(tabs)' : current === target;
    if (!onTarget) {
      router.replace(target);
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
