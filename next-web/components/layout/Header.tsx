'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import type { Route } from 'next';
import { useAppState } from '@/lib/state/app-state';
import { resolveUiLocale, UI_TEXT } from '@/lib/i18n/ui';

const navItems: Array<{ href: Route; key: 'home' | 'analysis' | 'wordbank' | 'library' }> = [
  { href: '/', key: 'home' },
  { href: '/analysis', key: 'analysis' },
  { href: '/wordbank', key: 'wordbank' },
  { href: '/library', key: 'library' },
];

export default function Header() {
  const pathname = usePathname();
  const { settings } = useAppState();
  const locale = resolveUiLocale(settings.systemLanguage);
  const text = UI_TEXT[locale];

  const navLabel = (key: 'home' | 'analysis' | 'wordbank' | 'library') => {
    if (key === 'home') return text.header.home;
    if (key === 'analysis') return text.header.analysis;
    if (key === 'wordbank') return text.header.wordbank;
    return text.header.library;
  };

  return (
    <header className="sticky top-0 z-50 border-b border-ag-border bg-ag-surface/65 backdrop-blur-xl supports-backdrop:backdrop-blur-xl transition-all duration-300">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link href="/" className="text-base font-semibold tracking-tight text-ag-text">
          Prompix
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                  active
                    ? 'text-ag-text font-medium'
                    : 'text-ag-muted hover:bg-ag-accent/8 hover:text-ag-accent'
                }`}
              >
                {navLabel(item.key)}
                {active ? (
                  <motion.span
                    layoutId="header-active"
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-ag-accent shadow-sm"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ag-border bg-ag-surface/20 backdrop-blur-sm text-ag-muted transition-all hover:-translate-y-0.5 hover:border-ag-accent/40 hover:text-ag-accent hover:shadow-ag"
            aria-label={text.header.settingsAria}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-1.6 1.6a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2a1.2 1.2 0 0 1-1.2 1.2h-2.2a1.2 1.2 0 0 1-1.2-1.2v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-1.6-1.6a1.2 1.2 0 0 1 0-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H2.7a1.2 1.2 0 0 1-1.2-1.2v-2.2a1.2 1.2 0 0 1 1.2-1.2H3a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.2 1.2 0 0 1 0-1.7l1.6-1.6a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V2.7a1.2 1.2 0 0 1 1.2-1.2h2.2a1.2 1.2 0 0 1 1.2 1.2V3a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l1.6 1.6a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.2 1.2 0 0 1 1.2 1.2v2.2a1.2 1.2 0 0 1-1.2 1.2h-.2a1 1 0 0 0-.9.6Z" />
            </svg>
          </Link>
        </div>
      </div>

      <nav className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 pb-2.5 md:hidden sm:px-6">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={`mobile-${item.href}`}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-all duration-200 ${
                active ? 'bg-ag-accent/15 text-ag-accent font-medium shadow-sm' : 'text-ag-muted hover:bg-ag-accent/5'
              }`}
            >
              {navLabel(item.key)}
            </Link>
          );
        })}
      </nav>

    </header>
  );
}
