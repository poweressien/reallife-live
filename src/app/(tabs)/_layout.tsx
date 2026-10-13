import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName, focused: IconName) =>
  function TabIcon({
    color,
    size,
    focused: f,
  }: {
    color: ColorValue;
    size: number;
    focused: boolean;
  }) {
    return <Ionicons name={f ? focused : name} size={size} color={color} />;
  };

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Live', tabBarIcon: icon('radio-outline', 'radio') }}
      />
      <Tabs.Screen
        name="discover"
        options={{ title: 'Discover', tabBarIcon: icon('search-outline', 'search') }}
      />
      <Tabs.Screen
        name="go-live"
        options={{ title: 'Go Live', tabBarIcon: icon('videocam-outline', 'videocam') }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Activity', tabBarIcon: icon('notifications-outline', 'notifications') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: icon('person-outline', 'person') }}
      />
    </Tabs>
  );
}
