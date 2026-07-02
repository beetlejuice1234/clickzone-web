import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
 theme: Theme;
 toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
 const [theme, setTheme] = useState<Theme>(() => {
  const saved = localStorage.getItem('cz-theme');
  return (saved as Theme) || 'dark';
 });

 useEffect(() => {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  localStorage.setItem('cz-theme', theme);
  
  // Also apply to body for some specific style overrides if needed
  document.body.className = theme;
 }, [theme]);

 const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

 return (
  <ThemeContext.Provider value={{ theme, toggleTheme }}>
   {children}
  </ThemeContext.Provider>
 );
}

export function useTheme() {
 const context = useContext(ThemeContext);
 if (context === undefined) {
  throw new Error('useTheme must be used within a ThemeProvider');
 }
 return context;
}
