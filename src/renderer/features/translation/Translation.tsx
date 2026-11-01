import { Loading } from '../../components/Loading';
import { effectiveModel, hasProviderAccess } from '../../../shared/modelSettings';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsSchema } from '../../../shared/types';
import type { AppSettings, Dialogue, SessionSnapshot } from '../../../shared/types';
import { Capture } from '../capture/Capture';
import { Field } from '../../components/Field';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useAction } from '../../components/useAction';

const OVERLAY_SAVE_DELAY_MS = 400;
const COST_FRACTION_DIGITS = 8;
const MIN_DISPLAY_COST = 10 ** -COST_FRACTION_DIGITS;

/** Màn hình phiên dịch: nguồn hình, chữ gốc và hội thoại có thể hiệu chỉnh. */
export function Translation({
  snapshot,
  openProfiles,
}: {
  snapshot: SessionSnapshot;
  openProfiles?: () => void;
}) {
  const { t } = useTranslation();
  const { run, error, busy } = useAction();
  const [edit, setEdit] = useState<Dialogue | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const editing = edit !== null;
  useEffect(() => {
    if (editing) dialog.current?.showModal();
  }, [editing]);
  const [showAll, setShowAll] = useState(false);
  const [overlayFullscreen, setOverlayFullscreen] = useState(snapshot.settings.overlayFullscreen);
  const [overlayFontSize, setOverlayFontSize] = useState(
    String(snapshot.settings.overlayFullscreenFontSize),
  );
  const [floatingFontSize, setFloatingFontSize] = useState(
    String(snapshot.settings.overlayFontSize),
  );
  const [overlayDuration, setOverlayDuration] = useState(
    String(snapshot.settings.overlayDurationSeconds),
  );
  const { run: runSettings, error: settingsError, busy: savingSettings } = useAction();
  const [overlayOpacity, setOverlayOpacity] = useState(snapshot.settings.overlayOpacity);
  const latestSettings = useRef(snapshot.settings);
  latestSettings.current = snapshot.settings;
  const savedChanges = useRef<Partial<AppSettings>>({});
  useEffect(() => {
    setOverlayFullscreen(snapshot.settings.overlayFullscreen);
    delete savedChanges.current.overlayFullscreen;
  }, [snapshot.settings.overlayFullscreen]);
  const pendingChanges = useRef<Partial<AppSettings>>({});
  const settingsQueue = useRef<Promise<void>>(Promise.resolve());
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Lưu nối tiếp để các thay đổi nhanh không ghi đè lẫn nhau. */
  function flushSettings(): void {
    clearTimeout(settingsTimer.current);
    const changes = pendingChanges.current;
    pendingChanges.current = {};
    if (!Object.keys(changes).length) return;
    settingsQueue.current = settingsQueue.current.then(async () => {
      const next = { ...latestSettings.current, ...savedChanges.current, ...changes };
      const result = await runSettings(() => window.app.settings(next));
      if (result.ok) Object.assign(savedChanges.current, changes);
      else if (
        changes.overlayFullscreen !== undefined &&
        pendingChanges.current.overlayFullscreen === undefined
      )
        setOverlayFullscreen(
          savedChanges.current.overlayFullscreen ?? latestSettings.current.overlayFullscreen,
        );
    });
  }
  /** Gộp trường hợp lệ; chuyển chế độ được áp dụng ngay, ô nhập chờ ngừng gõ. */
  function updateSetting<K extends keyof AppSettings>(
    field: K,
    value: AppSettings[K],
    immediate = false,
  ): void {
    if (settingsSchema.shape[field].safeParse(value).success)
      Object.assign(pendingChanges.current, { [field]: value });
    else delete pendingChanges.current[field];
    clearTimeout(settingsTimer.current);
    if (immediate) flushSettings();
    else settingsTimer.current = setTimeout(flushSettings, OVERLAY_SAVE_DELAY_MS);
  }
  const flushOnUnmount = useRef(() => {});
  flushOnUnmount.current = flushSettings;
  useEffect(() => () => flushOnUnmount.current(), []);
  const previewFontSize = settingsSchema.shape.overlayFontSize.safeParse(
    Number(overlayFullscreen ? overlayFontSize : floatingFontSize),
  );
  const profileId = snapshot.session?.profileId ?? '';
  const profile = snapshot.profiles.find((item) => item.id === profileId);
  const history = [...snapshot.dialogues].reverse();
  const costFormat = new Intl.NumberFormat(snapshot.settings.locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: COST_FRACTION_DIGITS,
  });
  /** Định dạng USD theo locale; số dương rất nhỏ không được làm tròn thành miễn phí. */
  function costLabel(costUsd: number | undefined): string {
    if (costUsd === undefined) return t('translation.costUnknown');
    const belowPrecision = costUsd > 0 && costUsd < MIN_DISPLAY_COST;
    return t(belowPrecision ? 'translation.costLessThan' : 'translation.cost', {
      amount: costFormat.format(belowPrecision ? MIN_DISPLAY_COST : costUsd),
    });
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>
            {t('translation.title')} {busy && <Loading />}
          </h1>
          <p>{t('translation.subtitle')}</p>
        </div>
        <span className="session-status">
          <i data-running={snapshot.status === 'running'} />
          {t(`status.${snapshot.status}`)}
        </span>
      </header>
      <div className="session-bar">
        <Field label={t('translation.profile')}>
          <select
            value={profileId}
            onChange={(e) => {
              void run(() => window.app.session(e.target.value));
            }}
          >
            <option value="" disabled>
              {t('translation.selectProfile')}
            </option>
            {snapshot.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          disabled={busy || !profileId}
          type="button"
          onClick={() => {
            void run(() => window.app.session(profileId));
          }}
        >
          {t('translation.newSession')}
        </button>
        <Field label={t('translation.resumeSession')}>
          <select
            value={snapshot.session?.id ?? ''}
            onChange={(e) => {
              if (e.target.value) void run(() => window.app.session(profileId, e.target.value));
            }}
          >
            <option value="">{t('translation.selectSession')}</option>
            {snapshot.sessions
              .filter((s) => s.profileId === profileId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {new Intl.DateTimeFormat(snapshot.settings.locale, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(s.createdAt)}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {(!hasProviderAccess(snapshot.settings, snapshot.hasApiKey) ||
        !effectiveModel(snapshot.settings)) && (
        <p className="notice">{t('translation.needsSetup')}</p>
      )}
      <ErrorNotice error={snapshot.error ?? error} />
      <div className="workspace-grid">
        <Capture snapshot={snapshot} />
        <section className="overlay-settings" aria-labelledby="overlay-settings-title">
          <div className="section-heading">
            <div>
              <h2 id="overlay-settings-title">{t('settings.overlay')}</h2>
              <p className="muted small">{t('translation.overlaySettingsHint')}</p>
            </div>
            <span className="muted small" role="status">
              {savingSettings ? <Loading /> : null}
              {t(savingSettings ? 'translation.overlaySaving' : 'translation.overlayAutoSave')}
            </span>
          </div>
          <div className="overlay-settings-layout">
            <div className="overlay-settings-preview">
              <p className="muted small">{t('translation.overlayPreview')}</p>
              <div
                className="subtitle-preview"
                style={{
                  fontSize: previewFontSize.success
                    ? previewFontSize.data
                    : overlayFullscreen
                      ? snapshot.settings.overlayFullscreenFontSize
                      : snapshot.settings.overlayFontSize,
                  backgroundColor: `color-mix(in srgb, var(--subtitle-bg) ${overlayOpacity * 100}%, var(--ground))`,
                }}
              >
                {t('settings.preview')}
              </div>
              <p className="muted small">
                {t(
                  overlayFullscreen
                    ? 'translation.overlayFullscreenHint'
                    : 'translation.overlayHint',
                )}
              </p>
              {!overlayFullscreen && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    void run(() => window.app.overlay(!snapshot.overlayEditing));
                  }}
                >
                  {t(snapshot.overlayEditing ? 'translation.overlayDone' : 'translation.overlay')}
                </button>
              )}
            </div>
            <div className="overlay-settings-fields">
              <label className="check-row">
                <input
                  className="checkbox checkbox-sm"
                  type="checkbox"
                  checked={overlayFullscreen}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setOverlayFullscreen(enabled);
                    updateSetting('overlayFullscreen', enabled, true);
                  }}
                />
                {t('settings.overlayFullscreen')}
              </label>
              <Field label={t('settings.fontSize')} hint={t('translation.overlayFloatingFontHint')}>
                <input
                  type="number"
                  required
                  min={16}
                  max={64}
                  step={1}
                  value={floatingFontSize}
                  aria-invalid={
                    !settingsSchema.shape.overlayFontSize.safeParse(Number(floatingFontSize))
                      .success
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setFloatingFontSize(value);
                    updateSetting('overlayFontSize', value === '' ? NaN : Number(value));
                  }}
                />
              </Field>
              <Field
                label={t('settings.fullscreenFontSize')}
                hint={t('translation.overlayFullscreenFontHint')}
              >
                <input
                  type="number"
                  required
                  min={16}
                  max={64}
                  step={1}
                  aria-invalid={
                    !settingsSchema.shape.overlayFullscreenFontSize.safeParse(
                      Number(overlayFontSize),
                    ).success
                  }
                  value={overlayFontSize}
                  onChange={(event) => {
                    const value = event.target.value;
                    setOverlayFontSize(value);
                    updateSetting('overlayFullscreenFontSize', value === '' ? NaN : Number(value));
                  }}
                />
              </Field>
              <Field label={`${t('settings.opacity')} (${Math.round(overlayOpacity * 100)}%)`}>
                <input
                  className="range range-sm"
                  type="range"
                  min={40}
                  max={100}
                  value={overlayOpacity * 100}
                  onChange={(event) => {
                    const value = Number(event.target.value) / 100;
                    setOverlayOpacity(value);
                    updateSetting('overlayOpacity', value);
                  }}
                />
              </Field>
              <Field label={t('settings.overlayDuration')} hint={t('settings.overlayDurationHint')}>
                <input
                  type="number"
                  required
                  min={1}
                  max={60}
                  step={1}
                  value={overlayDuration}
                  aria-invalid={
                    !settingsSchema.shape.overlayDurationSeconds.safeParse(Number(overlayDuration))
                      .success
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setOverlayDuration(value);
                    updateSetting('overlayDurationSeconds', value === '' ? NaN : Number(value));
                  }}
                />
              </Field>
            </div>
          </div>
          <ErrorNotice error={settingsError} />
        </section>
        <section className="recognition-panel" aria-label={t('shell.inspector')}>
          <div className="inspector-title">
            <h2>{t('shell.inspector')}</h2>
            <span>{t('shell.languagePair')}</span>
          </div>
          <div className="inspector-section">
            <div className="section-heading">
              <h2>{t('translation.ocr')}</h2>
              <span className="language-label">{t('shell.sourceLanguage')}</span>
            </div>
            <div className="recognized" aria-live="polite">
              {snapshot.ocrText || <span className="muted">{t('translation.ocrEmpty')}</span>}
            </div>
          </div>
          <div className="inspector-section">
            <div className="section-heading">
              <h2>{t('shell.subtitle')}</h2>
              <span className="language-label">{t('shell.targetLanguage')}</span>
            </div>
            <div className="live-subtitle" aria-live="polite">
              {snapshot.overlayText || <span className="muted">{t('shell.subtitleEmpty')}</span>}
            </div>
          </div>
          <div className="actions">
            <button
              type="button"
              disabled={
                snapshot.status !== 'running' ||
                !hasProviderAccess(snapshot.settings, snapshot.hasApiKey) ||
                !effectiveModel(snapshot.settings) ||
                busy
              }
              onClick={() => {
                void run(() => window.app.control('translate'));
              }}
            >
              {t('translation.manual')}
            </button>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={snapshot.settings.autoTranslate}
              onChange={(e) => {
                updateSetting('autoTranslate', e.target.checked, true);
              }}
            />
            {t('translation.auto')}
          </label>
          <div className="context-note">
            <h3>
              {t('translation.summary')} {snapshot.summaryLoading && <Loading />}
            </h3>
            <p>{snapshot.session?.summary || t('translation.summaryEmpty')}</p>
          </div>
          <div className="inspector-section glossary-inspector">
            <div className="section-heading">
              <h3>{t('context.glossary')}</h3>
              {openProfiles && (
                <button type="button" className="text-button" onClick={openProfiles}>
                  {t('shell.manage')}
                </button>
              )}
            </div>
            {profile?.glossary.length ? (
              <dl>
                {profile.glossary.map((term) => (
                  <div key={term.source}>
                    <dt>{term.source}</dt>
                    <dd>{term.target}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted small">{t('shell.glossaryEmpty')}</p>
            )}
          </div>
          <div className="inspector-section profile-facts">
            <h3>{t('context.characters')}</h3>
            {profile?.characters.length ? (
              <p>{profile.characters.map((character) => character.name).join(', ')}</p>
            ) : (
              <p className="muted small">{t('shell.charactersEmpty')}</p>
            )}
          </div>
        </section>
        <section className="history">
          <div className="section-heading">
            <h2>{t('translation.history')}</h2>
            <span className="muted small">{t('translation.count', { count: history.length })}</span>
          </div>
          <div className="dialogue-labels">
            <span>{t('translation.source')}</span>
            <span>{t('translation.target')}</span>
          </div>
          {!history.length && (
            <div className="empty-state">
              <strong>{t('translation.historyEmpty')}</strong>
              <p>{t('translation.historyHint')}</p>
            </div>
          )}
          {(showAll ? history : history.slice(0, 6)).map((d) => (
            <article className="dialogue" key={d.id}>
              <div>
                <small>{d.speaker === 'unknown' ? t('app.unknown') : d.speaker}</small>
                <p>{d.text}</p>
              </div>
              <div>
                <small>
                  {d.status === 'pending' && <Loading />} {t(`translation.${d.status}`)}
                </small>
                <p className={d.translation ? 'translated-text' : 'muted'}>
                  {d.translation || t(`translation.${d.status}`)}
                </p>
                <div className="row-footer">
                  <div className="muted small">
                    <div className="dialogue-model">
                      {d.modelId
                        ? t('translation.model', { model: d.modelId })
                        : t('translation.modelUnknown')}
                    </div>
                    <div>{t('translation.metrics', { ocr: d.ocrMs, api: d.apiMs })}</div>
                    <div>
                      {d.usage
                        ? t('translation.tokens', {
                            input: d.usage.inputTokens,
                            output: d.usage.outputTokens,
                          })
                        : t('translation.tokensUnknown')}
                    </div>
                    {d.fromCache && <div>{t('translation.cached')}</div>}
                    <div>{costLabel(d.costUsd)}</div>
                  </div>
                  <div className="actions">
                    <button type="button" className="text-button" onClick={() => setEdit({ ...d })}>
                      {t('translation.edit')}
                    </button>
                    {d.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => {
                          void run(() => window.app.retry(d.id));
                        }}
                      >
                        {t('app.retry')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
          {!showAll && history.length > 6 && (
            <button type="button" onClick={() => setShowAll(true)}>
              {t('translation.count', { count: history.length })}
            </button>
          )}
        </section>
      </div>
      {edit && (
        <dialog className="modal-backdrop" ref={dialog} onCancel={() => setEdit(null)}>
          <form
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => window.app.editDialogue(edit)).then((result) => {
                if (result.ok) setEdit(null);
              });
            }}
          >
            <h2 id="edit-title">{t('translation.edit')}</h2>
            <Field label={t('translation.source')}>
              <textarea
                autoFocus
                required
                value={edit.text}
                onChange={(e) => setEdit({ ...edit, text: e.target.value })}
              />
            </Field>
            <Field label={t('translation.target')}>
              <textarea
                value={edit.translation}
                onChange={(e) => setEdit({ ...edit, translation: e.target.value })}
              />
            </Field>
            <div className="two-columns">
              <Field label={t('translation.speaker')}>
                <input
                  value={edit.speaker}
                  onChange={(e) => setEdit({ ...edit, speaker: e.target.value })}
                />
              </Field>
              <Field label={t('translation.listener')}>
                <input
                  value={edit.listener}
                  onChange={(e) => setEdit({ ...edit, listener: e.target.value })}
                />
              </Field>
            </div>
            <ErrorNotice error={error} />
            <div className="actions">
              <button className="primary" disabled={busy}>
                {t('app.save')}
              </button>
              <button type="button" onClick={() => setEdit(null)}>
                {t('app.cancel')}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
