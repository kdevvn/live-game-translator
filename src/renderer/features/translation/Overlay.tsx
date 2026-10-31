import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionSnapshot } from '../../../shared/types';

const OVERLAY_CLOSE_HIDE_DELAY_MS = 3000;

/** Hiển thị OCR hoặc bản dịch mới nhất; chưa có nội dung thì để caption trống. */
export function Overlay({ snapshot }: { snapshot: SessionSnapshot }) {
  const { t } = useTranslation();
  const text = snapshot.overlayText;
  const [showClose, setShowClose] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointerActive = useRef(false);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  /** Hiện nút khi chuột di chuyển và ẩn sau thời gian không hoạt động. */
  function showCloseTemporarily(): void {
    setShowClose(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setShowClose(false);
      if (pointerActive.current) {
        pointerActive.current = false;
        void window.app.overlayPointer(false);
      }
    }, OVERLAY_CLOSE_HIDE_DELAY_MS);
  }
  return (
    <div
      className={snapshot.settings.overlayFullscreen ? 'overlay-fullscreen' : undefined}
      onMouseMove={snapshot.settings.overlayFullscreen ? showCloseTemporarily : undefined}
      style={
        snapshot.settings.overlayFullscreen
          ? {
              backgroundColor: `color-mix(in srgb, var(--overlay-fullscreen-bg) ${snapshot.settings.overlayOpacity * 100}%, transparent)`,
            }
          : undefined
      }
    >
      {snapshot.settings.overlayFullscreen && showClose && (
        <button
          type="button"
          className="btn btn-circle overlay-close"
          aria-label={t('translation.closeFullscreenOverlay')}
          title={t('translation.closeFullscreenOverlay')}
          onMouseEnter={() => {
            pointerActive.current = true;
            void window.app.overlayPointer(true);
          }}
          onMouseLeave={() => {
            pointerActive.current = false;
            void window.app.overlayPointer(false);
          }}
          onClick={() => void window.app.closeFullscreenOverlay()}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
      <div
        className={`overlay-caption ${snapshot.overlayEditing && !snapshot.settings.overlayFullscreen ? 'editing' : ''}`}
        style={{
          fontSize: snapshot.settings.overlayFullscreen
            ? snapshot.settings.overlayFullscreenFontSize
            : snapshot.settings.overlayFontSize,
          backgroundColor: snapshot.settings.overlayFullscreen
            ? undefined
            : `color-mix(in srgb, var(--subtitle-bg) ${snapshot.settings.overlayOpacity * 100}%, transparent)`,
        }}
      >
        {snapshot.overlayEditing && !snapshot.settings.overlayFullscreen && (
          <div className="overlay-controls">
            <span>{t('translation.overlayHint')}</span>
            <button
              type="button"
              onClick={() => {
                void window.app.overlay(false);
              }}
            >
              {t('translation.overlayDone')}
            </button>
          </div>
        )}
        <p>{text}</p>
      </div>
    </div>
  );
}
