// ============================================================
//  Theme Context — Global Light/Dark Mode Management
// ============================================================
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme } from './themes';

const ThemeContext = createContext({
  theme: darkTheme,
  isDark: true,
  toggleTheme: () => {},
  setThemeMode: () => {},
});

const THEME_KEY = '@hybrid_engine_theme';

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState('dark'); // 'light' | 'dark' | 'system'

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved) setThemeModeState(saved);
    });
  }, []);

  const resolvedMode =
    themeMode === 'system'
      ? systemScheme === 'dark' ? 'dark' : 'light'
      : themeMode;

  const theme = resolvedMode === 'dark' ? darkTheme : lightTheme;
  const isDark = resolvedMode === 'dark';

  function setThemeMode(mode) {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_KEY, mode);
  }

  function toggleTheme() {
    const next = isDark ? 'light' : 'dark';
    setThemeMode(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setThemeMode, themeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
