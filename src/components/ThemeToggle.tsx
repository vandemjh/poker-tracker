import React from 'react';
import { useTheme } from '../hooks/useTheme';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme, isDark } = useTheme();

  const getIcon = () => {
    if (theme === 'system') {
      return '💻';
    }
    if (isDark) {
      return '🌙';
    }
    return '☀️';
  };

  const getLabel = () => {
    switch (theme) {
      case 'system': return 'System';
      case 'light': return 'Light';
      case 'dark': return 'Dark';
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="w-10 h-10 flex items-center justify-center border-3 hover:translate-x-[1px] hover:translate-y-[1px] transition-all duration-100"
      title={`Theme: ${getLabel()}. Click to toggle.`}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-card)',
        boxShadow: '2px 2px 0px 0px var(--color-shadow)',
      }}
    >
      <span className="text-lg">{getIcon()}</span>
    </button>
  );
};

export default ThemeToggle;
