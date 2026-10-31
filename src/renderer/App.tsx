import { effectiveModel } from '../shared/modelSettings';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DebugEntry, SessionSnapshot } from '../shared/types';
import { Translation } from './features/translation/Translation';
import { Overlay } from './features/translation/Overlay';
import { Context } from './features/context/Context';
import { Settings } from './features/settings/Settings';
import { DebugLogs } from './features/settings/DebugLogs';
import { CommandPalette } from './components/CommandPalette';
import { useAction } from './components/useAction';
import type { AppScreen } from './components/CommandPalette';

const APP_SCREENS: AppScreen[] = ['translation', 'context', 'settings'];

/** Gốc giao diện chỉ giữ snapshot từ main; theme/locale áp dụng trên mọi cửa sổ. */
export function App({ initial, overlay = false }: { initial: SessionSnapshot; overlay?: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [screen, setScreen] = useState<AppScreen>('translation');
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugEntry[] | null>(null);
  const { run: clearLogs, busy: clearingLogs } = useAction();
  const frame = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();
  useEffect(() => {
    const unsubscribe = window.app.subscribe(setSnapshot);
    void window.app.snapshot().then((result) => {
      if (result.ok) setSnapshot(result.value);
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (overlay || !window.app.debugLogs) return;
    let changed = false;
    const unsubscribe = window.app.onDebugLogs((entries) => {
      changed = true;
      setDebugLogs(entries);
    });
    void window.app.debugLogs().then((result) => {
      if (!changed && result.ok) setDebugLogs(result.value);
    });
    return unsubscribe;
  }, [overlay]);
  useEffect(() => {
    document.documentElement.dataset.theme = snapshot.resolvedTheme;
    document.documentElement.lang = snapshot.settings.locale;
    void i18n.changeLanguage(snapshot.settings.locale);
  }, [snapshot.resolvedTheme, snapshot.settings.locale, i18n]);
  useEffect(() => {
    if (frame.current) frame.current.scrollTop = 0;
  }, [screen]);
  useEffect(() => {
    if (overlay) return;
    /** Mở bảng lệnh từ mọi màn hình, không đăng ký thêm phím tắt toàn hệ điều hành. */
    function keyboard(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandsOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [overlay]);
  if (overlay) {
    document.body.classList.add('overlay-body');
    return <Overlay snapshot={snapshot} />;
  }
  return (
    <div className="app-shell">
      <header className="desktop-titlebar">
        <span className="titlebar-product">{t('app.name')}</span>
        <span className="titlebar-scope">{snapshot.sourceName || t('shell.noSource')}</span>
        <button
          type="button"
          className="command-trigger"
          aria-label={t('commands.open')}
          onClick={() => setCommandsOpen(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10" cy="10" r="6" />
            <path d="m15 15 5 5" />
          </svg>
          <span>{t('commands.title')}</span>
          <kbd>Ctrl K</kbd>
        </button>
      </header>
      <aside className="sidebar">
        <div className="brand">
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <path d="M11 5H4v20h7M19 5h7v20h-7M10 12h10M10 18h7" />
          </svg>
          <div>
            <strong>{t('app.name')}</strong>
            <small>{t('app.subtitle')}</small>
          </div>
        </div>
        <nav aria-label={t('app.name')}>
          {[...APP_SCREENS, ...(debugLogs === null ? [] : ['debug' as const])].map((name) => (
            <button
              type="button"
              key={name}
              className={screen === name ? 'active' : ''}
              aria-current={screen === name ? 'page' : undefined}
              onClick={() => setScreen(name)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                {name === 'translation' ? (
                  <path d="M3 4h18v13H3zM8 21h8M12 17v4M7 9h10M7 13h6" />
                ) : name === 'debug' ? (
                  <path d="M4 4h16v16H4zM7 8l3 3-3 3M12 15h5" />
                ) : name === 'context' ? (
                  <path d="M8 3h11v18H8M8 6H4v15h15M11 8h5M11 12h5" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
                  </>
                )}
              </svg>
              {t(`nav.${name}`)}
            </button>
          ))}
        </nav>
        <div className="sidebar-session">
          <small>{t('shell.currentSession')}</small>
          <strong>
            {snapshot.profiles.find((p) => p.id === snapshot.session?.profileId)?.name ||
              t('translation.selectProfile')}
          </strong>
          <span className="session-status" role="status">
            <i data-running={snapshot.status === 'running'} />
            {t(`status.${snapshot.status}`)}
          </span>
        </div>
        <div className="sidebar-footer">
          <span>{t('shell.languagePair')}</span>
          <p>{t('app.local')}</p>
          <div className="shortcut-hint">
            <span>{t('translation.manual')}</span>
            <kbd>{snapshot.settings.translateShortcut}</kbd>
          </div>
          <div className="shortcut-hint">
            <span>{t('capture.pause')}</span>
            <kbd>{snapshot.settings.pauseShortcut}</kbd>
          </div>
        </div>
      </aside>
      <div className="main-frame" ref={frame}>
        <main className="sheet">
          {screen === 'translation' ? (
            <Translation snapshot={snapshot} openProfiles={() => setScreen('context')} />
          ) : screen === 'context' ? (
            <Context snapshot={snapshot} />
          ) : screen === 'debug' ? (
            <DebugLogs
              entries={debugLogs ?? []}
              loading={debugLogs === null || clearingLogs}
              clear={() => {
                void clearLogs(() => window.app.clearDebugLogs());
              }}
            />
          ) : (
            <Settings snapshot={snapshot} />
          )}
        </main>
      </div>
      <footer className="statusbar">
        <span>{t('shell.localOcr')}</span>
        <span>{effectiveModel(snapshot.settings) || t('shell.noModel')}</span>
        <span>{t('shell.languagePair')}</span>
      </footer>
      {commandsOpen && (
        <CommandPalette
          snapshot={snapshot}
          navigate={setScreen}
          close={() => setCommandsOpen(false)}
        />
      )}
    </div>
  );
}
