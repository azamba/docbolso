import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F6F8',
  card: '#FFFFFF',
  text: '#14181F',
  muted: '#667085',
  border: '#E3E7EC',
  primary: '#1F6FEB',
  onPrimary: '#FFFFFF',
  danger: '#D92D20',
  input: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#0E1116',
  card: '#181C23',
  text: '#ECEFF3',
  muted: '#98A2B3',
  border: '#2A303A',
  primary: '#4C8DFF',
  onPrimary: '#FFFFFF',
  danger: '#F97066',
  input: '#12161C',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
