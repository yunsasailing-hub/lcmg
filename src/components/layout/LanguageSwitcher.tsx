import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

type LanguageSwitcherProps = {
  collapsed?: boolean;
  inMenu?: boolean;
  compact?: boolean;
};

export function LanguageToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { i18n } = useTranslation();
  const isVi = i18n.language === 'vi';

  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(isVi ? 'en' : 'vi')}
      className={cn('nav-item w-full', collapsed && 'justify-center px-0')}
      title={isVi ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
    >
      <Globe className="h-5 w-5 shrink-0" />
      {!collapsed && <span className="text-sm font-medium">{isVi ? 'EN' : 'VI'}</span>}
    </button>
  );
}

export function LanguagePill({ collapsed = false, inMenu = false, compact = false }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const currentLanguage = i18n.language === 'vi' ? 'vi' : 'en';

  return (
    <div
      className={cn(
        'flex items-center rounded-full border p-1',
        compact ? 'gap-1' : 'justify-between gap-3',
        collapsed && 'justify-center',
        compact ? 'w-auto shrink-0' : inMenu ? 'w-full' : 'w-full max-w-xs',
      )}
      style={{
        background: 'var(--nav-active)',
        borderColor: 'var(--sidebar-border)',
      }}
      aria-label={t('nav.language')}
    >
      {!compact && !collapsed && (
        <div className="flex items-center gap-2 px-3" style={{ color: 'var(--nav-foreground)' }}>
          <Globe className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]">
            {t('nav.language')}
          </span>
        </div>
      )}

      {compact && (
        <div className="flex items-center gap-2 pl-2 pr-1" style={{ color: 'var(--nav-foreground)' }}>
          <Globe className="h-4 w-4 shrink-0" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        {[
          { value: 'en', label: 'EN' },
          { value: 'vi', label: 'VI' },
        ].map((language) => {
          const isActive = currentLanguage === language.value;

          return (
            <button
              key={language.value}
              type="button"
              onClick={() => i18n.changeLanguage(language.value)}
              className={cn(
                'rounded-full text-xs font-bold tracking-[0.16em] transition-colors',
                compact ? 'min-h-10 min-w-11 px-3' : 'min-h-9 px-3',
              )}
              style={
                isActive
                  ? {
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                    }
                  : {
                      color: 'var(--nav-foreground)',
                    }
              }
              aria-pressed={isActive}
              aria-label={language.value === 'en' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
            >
              {language.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}