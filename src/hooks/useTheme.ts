import { useEffect, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from './useAppSelector';
import { setTheme } from '../store';

type Theme = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'poker-tracker-theme';

export function useTheme() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector(state => state.ui.theme);

  // Get the actual theme to apply (resolving 'system' to light/dark)
  const getResolvedTheme = useCallback((themeValue: Theme): 'light' | 'dark' => {
    if (themeValue === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return themeValue;
  }, []);

  // Apply theme to document
  const applyTheme = useCallback((themeValue: Theme) => {
    const resolved = getResolvedTheme(themeValue);
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [getResolvedTheme]);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored && ['system', 'light', 'dark'].includes(stored)) {
      dispatch(setTheme(stored));
      applyTheme(stored);
    } else {
      // Default to system
      applyTheme('system');
    }
  }, [dispatch, applyTheme]);

  // Apply theme when it changes
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, applyTheme]);

  // Listen for system theme changes when using 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme]);

  // Toggle function to cycle through themes
  const toggleTheme = useCallback(() => {
    const nextTheme: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    dispatch(setTheme(nextTheme));
  }, [theme, dispatch]);

  // Set a specific theme
  const setThemeValue = useCallback((newTheme: Theme) => {
    dispatch(setTheme(newTheme));
  }, [dispatch]);

  return {
    theme,
    resolvedTheme: getResolvedTheme(theme),
    toggleTheme,
    setTheme: setThemeValue,
    isDark: getResolvedTheme(theme) === 'dark',
  };
}
