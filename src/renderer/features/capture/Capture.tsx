import { Loading } from '../../components/Loading';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_REGION, PREVIEW_HEIGHT, PREVIEW_WIDTH } from '../../../shared/defaults';
import { regionSchema } from '../../../shared/types';
import type { CaptureRegion, CaptureSource, SessionSnapshot } from '../../../shared/types';
import { regionFromPoints } from './region';
import type { RegionPoint } from './region';
import { Field } from '../../components/Field';
import { useAction } from '../../components/useAction';
import { ErrorNotice } from '../../components/ErrorNotice';
import { connectPreview } from './preview';

/** Chọn nguồn, preview và crop; không sở hữu stream thứ hai trong UI. */
export function Capture({ snapshot }: { snapshot: SessionSnapshot }) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [sourceId, setSourceId] = useState(snapshot.sourceId);
  const [region, setRegion] = useState<CaptureRegion>(snapshot.region ?? DEFAULT_REGION);
  const video = useRef<HTMLVideoElement>(null);
  const [previewMaxWidth, setPreviewMaxWidth] = useState(PREVIEW_WIDTH);
  const [previewError, setPreviewError] = useState(false);
  const [drag, setDrag] = useState<RegionPoint | null>(null);
  const anchor = useRef<RegionPoint | null>(null);
  const { run, error, busy } = useAction();
  const active = snapshot.status === 'running' || snapshot.status === 'starting';
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const latestRegion = useRef(snapshot.region);
  latestRegion.current = snapshot.region;
  useEffect(() => {
    setRegion(latestRegion.current ?? DEFAULT_REGION);
  }, [snapshot.session?.profileId]);
  /** Cập nhật ngay giao diện và lưu vùng hợp lệ cho hồ sơ đang chọn. */
  function updateRegion(value: CaptureRegion): void {
    setRegion(value);
    const profileId = snapshot.session?.profileId;
    if (profileId && regionSchema.safeParse(value).success)
      void run(() => window.app.setProfileRegion(profileId, value));
  }

  useEffect(() => {
    if (!sourceId || active) return;
    const id = crypto.randomUUID();
    let disposed = false;
    void window.app
      .previewSource(sourceId, id)
      .then((result) => {
        if (disposed) return;
        if (!result.ok) setPreviewError(true);
      })
      .catch(() => {
        if (!disposed) setPreviewError(true);
      });
    return () => {
      disposed = true;
      void window.app.previewSource(null, id).catch(() => undefined);
    };
  }, [sourceId, active, snapshot.session?.id, previewAttempt]);
  useEffect(() => {
    if (!video.current || snapshot.previewGeneration === undefined) return;
    return connectPreview(video.current, snapshot.previewGeneration, () => setPreviewError(true));
  }, [snapshot.previewGeneration]);
  /** Làm mới nguồn theo yêu cầu, không quét mọi cửa sổ liên tục. */
  async function refresh(): Promise<void> {
    const result = await run(() => window.app.sources());
    if (result.ok) {
      setSources(result.value);
      setPreviewError(false);
      setPreviewAttempt((attempt) => attempt + 1);
    }
  }
  /** Giới hạn khung theo tỷ lệ video thực để cả chiều rộng và cao không vượt Full HD. */
  function updatePreviewSize(event: SyntheticEvent<HTMLVideoElement>): void {
    const { videoWidth, videoHeight } = event.currentTarget;
    if (videoWidth > 0 && videoHeight > 0)
      setPreviewMaxWidth(Math.min(PREVIEW_WIDTH, (PREVIEW_HEIGHT * videoWidth) / videoHeight));
  }
  /** Tính tọa độ trên đúng khung ảnh, cho phép kéo ra ngoài bằng pointer capture. */
  function point(event: PointerEvent<HTMLDivElement>): RegionPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }
  /** Kết thúc vùng chọn và chỉ lưu khi có diện tích đủ lớn. */
  function finish(event: PointerEvent<HTMLDivElement>): void {
    if (anchor.current) {
      const value = regionFromPoints(anchor.current, point(event));
      if (value) updateRegion(value);
    }
    anchor.current = null;
    setDrag(null);
  }
  const selection =
    anchor.current && drag ? (regionFromPoints(anchor.current, drag) ?? region) : region;
  return (
    <section className="capture-panel">
      <div className="section-heading">
        <h2>
          {t('capture.title')} {busy && <Loading />}
        </h2>
        <div className="actions">
          <button
            type="button"
            disabled={busy || active}
            onClick={() => {
              void refresh();
            }}
          >
            {t('capture.refresh')}
          </button>
          <button
            type="button"
            onClick={() => {
              void run(() => window.app.testSource());
            }}
          >
            {t('capture.test')}
          </button>
        </div>
      </div>
      <div className="capture-source">
        <Field label={t('capture.selectWindow')}>
          <select
            value={sourceId}
            disabled={active || busy}
            onFocus={() => {
              if (!sources.length) void refresh();
            }}
            onChange={(event) => {
              setSourceId(event.target.value);
              setPreviewError(false);
            }}
          >
            <option value="">{t('capture.selectWindow')}</option>
            {sourceId && !sources.some((source) => source.id === sourceId) && (
              <option value={sourceId}>{snapshot.sourceName || sourceId}</option>
            )}
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div
        className="preview"
        style={{ maxWidth: previewMaxWidth }}
        onPointerDown={(event) => {
          if (active || !video.current?.videoWidth) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          anchor.current = point(event);
          setDrag(point(event));
        }}
        onPointerMove={(event) => {
          if (anchor.current) setDrag(point(event));
        }}
        onPointerUp={finish}
        onPointerCancel={() => {
          anchor.current = null;
          setDrag(null);
        }}
      >
        {sourceId || active ? (
          <>
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              onLoadedMetadata={updatePreviewSize}
              onResize={updatePreviewSize}
              aria-label={t('capture.preview')}
            />
            <div
              className="selection"
              style={{
                left: `${selection.x * 100}%`,
                top: `${selection.y * 100}%`,
                width: `${selection.width * 100}%`,
                height: `${selection.height * 100}%`,
              }}
            >
              <span>{t('capture.region')}</span>
            </div>
          </>
        ) : (
          <div className="preview-empty">
            <svg width="48" height="38" viewBox="0 0 48 38" aria-hidden="true">
              <rect x="2" y="2" width="44" height="29" rx="3" />
              <path d="M17 36h14M24 31v5M14 16h20M14 22h13" />
            </svg>
            <strong>{t('capture.empty')}</strong>
            <p>{t('capture.hint')}</p>
          </div>
        )}
      </div>
      <div className="capture-setup">
        <div className="actions capture-controls">
          <button
            className="btn btn-primary btn-sm primary"
            type="button"
            disabled={
              !snapshot.session ||
              !sourceId ||
              active ||
              busy ||
              region.width <= 0 ||
              region.height <= 0
            }
            onClick={() => {
              setPreviewError(false);
              void run(() => window.app.start(sourceId, region));
            }}
          >
            {t('capture.start')}
          </button>
          <button
            type="button"
            disabled={!active && snapshot.status !== 'paused'}
            onClick={() => {
              void run(() => window.app.control('pause'));
            }}
          >
            {t(snapshot.status === 'paused' ? 'capture.resume' : 'capture.pause')}
          </button>
          <button
            type="button"
            disabled={snapshot.status === 'idle' && !sourceId}
            onClick={() => {
              setSourceId('');
              void run(() => window.app.control('stop'));
            }}
          >
            {t('capture.stop')}
          </button>
        </div>
        {previewError && (
          <p role="alert" className="muted small">
            {t('capture.previewError')}
          </p>
        )}
        <details className="region-details">
          <summary>{t('capture.coordinates')}</summary>
          <div className="region-inputs">
            {(['x', 'y', 'width', 'height'] as const).map((key) => (
              <Field key={key} label={t(`capture.${key}`)}>
                <input
                  type="number"
                  min={key === 'width' || key === 'height' ? 1 : 0}
                  max={100}
                  disabled={active}
                  value={Math.round(region[key] * 100)}
                  onChange={(event) => {
                    const next = {
                      ...region,
                      [key]: Math.min(1, Math.max(0, Number(event.target.value) / 100)),
                    };
                    next.width = Math.min(next.width, 1 - next.x);
                    next.height = Math.min(next.height, 1 - next.y);
                    updateRegion(next);
                  }}
                />
              </Field>
            ))}
          </div>
          <button
            type="button"
            disabled={active}
            onClick={() => updateRegion({ x: 0, y: 0, width: 1, height: 1 })}
          >
            {t('capture.full')}
          </button>
        </details>
        <p className="muted small">{t('capture.changed')}</p>
        <ErrorNotice error={error} />
      </div>
    </section>
  );
}
