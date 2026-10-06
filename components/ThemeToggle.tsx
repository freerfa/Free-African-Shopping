import { useTheme } from '../contexts/ThemeContext';
import SunIcon from './icons/SunIcon';
import MoonIcon from './icons/MoonIcon';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full text-brand-offwhite hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-brand-dark focus:ring-brand-gold transition-colors duration-300"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
};

export default ThemeToggle;