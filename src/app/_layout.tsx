import { Stack } from 'expo-router';

// Temporary root layout — replaced in Task 24 by AppProviders + auth gating.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
