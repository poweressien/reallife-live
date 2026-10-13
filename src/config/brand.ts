/** Single place to rebrand: name, accent colours, and tagline. */
export const brand = {
  name: process.env.EXPO_PUBLIC_APP_NAME || 'RealLife Live',
  tagline: 'Share your real life, live.',
  colors: {
    primary: '#FF3D71',
    primaryPressed: '#E02A5C',
    accent: '#7C5CFF',
    live: '#FF2D55',
  },
} as const;
