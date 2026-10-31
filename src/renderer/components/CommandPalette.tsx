import { Loading } from './Loading';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionSnapshot } from '../../shared/types';
import { useAction } from './useAction';
import { ErrorNotice } from './ErrorNotice';

/** Các màn hình chính có thể mở từ sidebar hoặc bảng lệnh. */
export type AppScreen = 'translation' | 'context' | 'settings' | 'debug';

/** Bảng lệnh modal, dùng snapshot thật để khóa thao tác chưa sẵn sàng. */
export function CommandPalette({
  snapshot,
  navigate,
  close,
}: {
  snapshot: SessionSnapshot;
  navigate: (screen: AppScreen) => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { run, busy, error } = useAction();
  const running = snapshot.status === 'running';
  const commands = [
    ...(['translation', 'context', 'settings'] as const).map((screen) => ({
      id: screen,
      label: t(`nav.${screen}`),
      shortcut: '',
      disabled: false,
      action: () => {
        navigate(screen);
        return Promise.resolve({ ok: true as const, value: undefined });
      },
    })),
    {
      id: 'translate',
      label: t('translation.manual'),
      shortcut: snapshot.settings.translateShortcut,
      disabled: !running || !snapshot.hasApiKey || !snapshot.settings.model,
      action: () => window.app.control('translate'),
    },
    {
      id: 'pause',
      label: t(snapshot.status === 'paused' ? 'capture.resume' : 'capture.pause'),
      shortcut: snapshot.settings.pauseShortcut,
      disabled: !running && snapshot.status !== 'paused',
      action: () => window.app.control('pause'),
    },
    {
      id: 'stop',
      label: t('capture.stop'),
      shortcut: '',
      disabled: snapshot.status === 'idle',
      action: () => window.app.control('stop'),
    },
    {
      id: 'overlay',
      label: t(snapshot.overlayEditing ? 'translation.overlayDone' : 'translation.overlay'),
      shortcut: '',
      disabled: false,
      action: () => window.app.overlay(!snapshot.overlayEditing),
    },
  ].filter((command) =>
    command.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const selected = Math.min(active, Math.max(0, commands.length - 1));

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    search.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    dialog.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  /** Đóng khi thành công; lỗi IPC giữ bảng lệnh mở với thông báo có thể đọc. */
  async function execute(index: number): Promise<void> {
    const command = commands[index];
    if (!command || command.disabled || busy) return;
    const result = await run(command.action);
    if (result.ok) close();
  }

  return (
    <dialog
      ref={dialog}
      className="command-palette"
      aria-label={t('commands.title')}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="command-search">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" />
        </svg>
        <input
          ref={search}
          role="combobox"
          aria-label={t('commands.search')}
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={commands.length ? `${id}-${selected}` : undefined}
          placeholder={t('commands.search')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setActive(
                Math.max(
                  0,
                  Math.min(commands.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)),
                ),
              );
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              void execute(selected);
            }
          }}
        />
        <button type="button" className="text-button" onClick={close} aria-label={t('app.cancel')}>
          <kbd>Esc</kbd>
        </button>
      </div>
      <div
        id={`${id}-list`}
        role="listbox"
        aria-label={t('commands.title')}
        className="command-list"
        aria-busy={busy}
      >
        {commands.map((command, index) => (
          <button
            type="button"
            role="option"
            key={command.id}
            id={`${id}-${index}`}
            aria-selected={selected === index}
            disabled={command.disabled || busy}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => {
              void execute(index);
            }}
          >
            <span>{command.label}</span>
            {command.shortcut && <kbd>{command.shortcut}</kbd>}
          </button>
        ))}
        {!commands.length && <p className="command-empty">{t('commands.empty')}</p>}
      </div>
      {busy && <Loading />}
      <ErrorNotice error={error} />
      <footer className="command-footer">
        <span>{t('commands.navigate')}</span>
        <span>{t('commands.execute')}</span>
      </footer>
    </dialog>
  );
}
