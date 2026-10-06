import React, { useEffect, useState } from 'react';
import type { User } from '../types';
import { View } from '../types';
import { useStore } from '../contexts/StoreContext';
import ShoppingCartIcon from './icons/ShoppingCartIcon';
import AdminIcon from './icons/AdminIcon';
import LogoutIcon from './icons/LogoutIcon';
import LogoIcon from './icons/LogoIcon';
import SearchIcon from './icons/SearchIcon';
import MenuIcon from './icons/MenuIcon';
import CloseIcon from './icons/CloseIcon';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  user: User | null;
  cartItemCount: number;
  setView: (view: View) => void;
  onLogout: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  user,
  cartItemCount,
  setView,
  onLogout,
  searchQuery,
  onSearchChange,
}) => {
  const { config } = useStore();

  // Phone/tablet (< md) navigation lives in a collapsible menu toggled by the
  // hamburger button at the end of the nav.
  const [menuOpen, setMenuOpen] = useState(false);

  // Escape dismisses the open menu, for keyboard users.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  /** Header and menu links navigate and dismiss the menu in one go. */
  const navigate = (view: View) => {
    setMenuOpen(false);
    setView(view);
  };

  const menuItemClass =
    'w-full text-left px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors';

  const searchInputClass =
    'w-full pl-9 pr-3 py-2 rounded-full bg-white/10 border border-white/20 text-sm text-brand-offwhite placeholder-brand-offwhite/50 focus:outline-none focus:ring-2 focus:ring-brand-gold';

  return (
    <header className="bg-brand-dark text-brand-offwhite shadow-lg sticky top-0 z-50">
      {config.announcement && (
        <div className="bg-brand-gold text-brand-dark text-xs sm:text-sm font-semibold py-2 overflow-hidden">
          {/* One static copy for assistive tech; the scrolling track below is
              decorative. Two identical groups + a -50% slide = seamless loop. */}
          <span className="sr-only">{config.announcement}</span>
          <div className="fas-marquee-track" aria-hidden="true">
            {[0, 1].map((group) => (
              <div key={group} className="fas-marquee-group">
                {[0, 1, 2, 3].map((copy) => (
                  <span key={copy} className="whitespace-nowrap px-6">
                    {config.announcement}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* z-50 keeps the header rows above the menu backdrop (z-40). */}
      <div className="relative z-50 container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center gap-4">
        {/* No shrink-0 here: the title must be allowed to contract so `truncate`
            ellipsizes long store names instead of pushing the nav off-screen. */}
        <button onClick={() => navigate(View.Home)} className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <span className="hidden sm:block shrink-0"><LogoIcon /></span>
          <h1 className="text-lg sm:text-3xl font-display font-bold text-brand-gold truncate">
            {config.storeName}
          </h1>
        </button>

        <nav className="flex items-center space-x-3 sm:space-x-4 md:space-x-6 shrink-0">
          <div className="relative hidden md:block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-offwhite/50 pointer-events-none">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search products"
              aria-label="Search products"
              className={`${searchInputClass} w-40 lg:w-60`}
            />
          </div>

          <button onClick={() => navigate(View.Home)} className="hidden md:block hover:text-brand-gold transition-colors duration-300">
            Home
          </button>

          <button
            onClick={() => navigate(View.Cart)}
            className="relative hover:text-brand-gold transition-colors duration-300"
            aria-label={`Cart, ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`}
          >
            <ShoppingCartIcon />
            {cartItemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-brand-gold text-brand-dark text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {cartItemCount}
              </span>
            )}
          </button>

          {user?.isAdmin && (
            <button
              onClick={() => navigate(View.Admin)}
              className="hidden md:flex items-center space-x-2 hover:text-brand-gold transition-colors duration-300"
            >
              <AdminIcon />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}

          <ThemeToggle />

          {user ? (
            <button
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              className="hidden md:flex items-center space-x-2 bg-brand-gold hover:bg-brand-gold-light text-brand-dark font-semibold py-2 px-3 sm:px-4 rounded-full transition-colors duration-300"
            >
              <LogoutIcon />
              <span className="hidden sm:inline">Logout</span>
            </button>
          ) : (
            <button
              onClick={() => navigate(View.Login)}
              className="hidden md:block bg-brand-gold hover:bg-brand-gold-light text-brand-dark font-semibold py-2 px-3 sm:px-4 rounded-full transition-colors duration-300"
            >
              Login
            </button>
          )}

          {/* Phone menu toggle; everything hidden above md lives in the panel. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="md:hidden p-2 -mr-1 rounded-full hover:bg-white/20 transition-colors duration-300"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </nav>
      </div>

      {menuOpen && (
        <>
          {/* Backdrop: tapping outside the panel dismisses the menu. */}
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            id="mobile-nav"
            aria-label="Main menu"
            className="relative z-50 md:hidden border-t border-white/10 px-4 sm:px-6 py-3 space-y-1"
          >
            <button onClick={() => navigate(View.Home)} className={menuItemClass}>
              Home
            </button>
            <button
              onClick={() => navigate(View.Cart)}
              className={`${menuItemClass} flex items-center justify-between`}
            >
              <span>Cart</span>
              {cartItemCount > 0 && (
                <span className="bg-brand-gold text-brand-dark text-xs font-bold rounded-full h-5 px-1.5 shrink-0 flex items-center justify-center">
                  {cartItemCount}
                </span>
              )}
            </button>
            {user?.isAdmin && (
              <button onClick={() => navigate(View.Admin)} className={menuItemClass}>
                Admin panel
              </button>
            )}
            {user ? (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className={menuItemClass}
              >
                Logout
              </button>
            ) : (
              <button onClick={() => navigate(View.Login)} className={menuItemClass}>
                Login
              </button>
            )}
          </nav>
        </>
      )}

      <div className="relative z-50 container mx-auto px-4 sm:px-6 pb-3 md:hidden">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-offwhite/50 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              // Typing in search jumps to the home view; fold the menu away too.
              setMenuOpen(false);
              onSearchChange(e.target.value);
            }}
            placeholder="Search products"
            aria-label="Search products"
            className={searchInputClass}
          />
        </div>
      </div>
    </header>
  );
};

export default Header;