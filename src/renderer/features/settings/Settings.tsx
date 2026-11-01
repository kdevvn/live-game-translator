import { Loading } from '../../components/Loading';
import { effectiveModel, providerIdentity } from '../../../shared/modelSettings';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsSchema } from '../../../shared/types';
import type { AppSettings, ModelOption, SessionSnapshot } from '../../../shared/types';
import {
  DEFAULT_SETTINGS,
  PROFILE_INPUT_TOKEN_LIMIT_MIN,
  PROFILE_INPUT_TOKEN_LIMIT_MAX,
} from '../../../shared/defaults';
import { Field } from '../../components/Field';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useAction } from '../../components/useAction';
import { ModelSelect } from './ModelSelect';

const SETTINGS_SAVE_DELAY_MS = 400;
const KEY_SAVE_DELAY_MS = 1200;

/** Tự lưu cấu hình hợp lệ, API key chỉ đi một chiều về main. */
export function Settings({ snapshot }: { snapshot: SessionSnapshot }) {
  const { t } = useTranslation();
  const [value, setDraft] = useState<AppSettings>(snapshot.settings);
  const draft = useRef(snapshot.settings);
  const savedSettings = useRef(snapshot.settings);
  const pending = useRef<Partial<AppSettings>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyValue = useRef('');
  const settingsQueue = useRef<Promise<void>>(Promise.resolve());
  const keyQueue = useRef<Promise<void>>(Promise.resolve());
  const [key, setKey] = useState('');
  const [models, setModels] = useState<ModelOption[]>(snapshot.modelOptions ?? []);
  useEffect(() => {
    if (snapshot.modelOptions) setModels(snapshot.modelOptions);
  }, [snapshot.modelOptions]);
  const { run, error, busy } = useAction();
  const { run: runModels, error: modelError, busy: modelsBusy } = useAction();
  const local = value.provider !== 'openRouter';
  const ollama = value.provider === 'ollama';
  const baseUrlField = ollama ? 'ollamaBaseUrl' : 'lmStudioBaseUrl';
  const hasKey = local
    ? ollama
      ? snapshot.hasOllamaToken
      : snapshot.hasLmStudioToken
    : snapshot.hasApiKey;
  const modelField = ollama ? 'ollamaModel' : local ? 'lmStudioModel' : 'model';
  const backgroundFields = ollama
    ? (['ollamaSummaryModel', 'ollamaProfileModel'] as const)
    : local
      ? (['lmStudioSummaryModel', 'lmStudioProfileModel'] as const)
      : (['summaryModel', 'profileModel'] as const);
  /** Lưu tuần tự các trường hợp lệ, ghép với cấu hình đã lưu gần nhất. */
  function flushSettings(): void {
    clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    settingsQueue.current = settingsQueue.current.then(async () => {
      const next = { ...savedSettings.current, ...patch };
      const result = await run(() => window.app.settings(next));
      if (result.ok) savedSettings.current = next;
    });
  }
  /** Cập nhật bản nháp và chỉ đưa trường hợp lệ vào hàng đợi tự lưu. */
  function setValue(next: AppSettings): void {
    const previous = draft.current;
    draft.current = next;
    setDraft(next);
    for (const field of Object.keys(next) as (keyof AppSettings)[]) {
      if (Object.is(previous[field], next[field])) continue;
      if (settingsSchema.shape[field].safeParse(next[field]).success)
        Object.assign(pending.current, { [field]: next[field] });
      else delete pending.current[field];
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(flushSettings, SETTINGS_SAVE_DELAY_MS);
  }
  /** Lưu key khi ngừng nhập hoặc rời ô; không xóa key khi ô trống. */
  function flushKey(): void {
    clearTimeout(keyTimer.current);
    const next = keyValue.current;
    const provider = draft.current.provider;
    if (!next) return;
    keyValue.current = '';
    keyQueue.current = keyQueue.current.then(async () => {
      const result = await run(() =>
        provider !== 'openRouter' ? window.app.saveKey(next, provider) : window.app.saveKey(next),
      );
      if (draft.current.provider !== provider) return;
      if (result.ok) setKey((current) => (current === next ? '' : current));
      else if (!keyValue.current) keyValue.current = next;
    });
  }
  const flushOnUnmount = useRef(() => {});
  flushOnUnmount.current = () => {
    flushSettings();
    flushKey();
  };
  useEffect(() => () => flushOnUnmount.current(), []);
  /** Tải model theo key đã lưu; không dùng key nhập chưa submit. */
  async function loadModels(): Promise<void> {
    flushSettings();
    flushKey();
    await settingsQueue.current;
    await keyQueue.current;
    const identity = providerIdentity(draft.current);
    if (
      !settingsSchema.safeParse(draft.current).success ||
      identity !== providerIdentity(savedSettings.current)
    )
      return;
    const result = await runModels(() => window.app.models());
    if (result.ok && identity === providerIdentity(draft.current)) setModels(result.value);
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>
            {t('settings.title')} {busy && <Loading />}
          </h1>
          <p>{t('settings.subtitle')}</p>
        </div>
      </header>
      <form id="settings-form" onSubmit={(event) => event.preventDefault()}>
        <section className="settings-section settings-appearance">
          <div>
            <h2>{t('settings.appearance')}</h2>
            <p className="muted">{t('app.subtitle')}</p>
          </div>
          <div className="settings-fields">
            <Field label={t('settings.theme')}>
              <select
                value={value.theme}
                onChange={(e) =>
                  setValue({ ...value, theme: e.target.value as AppSettings['theme'] })
                }
              >
                {(['system', 'light', 'dark'] as const).map((theme) => (
                  <option key={theme} value={theme}>
                    {t(`settings.${theme}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('settings.locale')}>
              <select
                value={value.locale}
                onChange={(e) => setValue({ ...value, locale: e.target.value as 'vi' | 'en' })}
              >
                <option value="vi">{t('settings.vietnamese')}</option>
                <option value="en">{t('settings.english')}</option>
              </select>
            </Field>
          </div>
        </section>
        <section className="settings-section settings-connection">
          <div>
            <h2>{t('settings.connection')}</h2>
            <p className="muted">{t('settings.saveHint')}</p>
            <p className="small">
              {t(
                local
                  ? hasKey
                    ? 'settings.hasToken'
                    : 'settings.optionalTokenHint'
                  : hasKey
                    ? 'settings.hasKey'
                    : 'settings.noKey',
              )}
            </p>
          </div>
          <div className="settings-fields">
            <Field label={t('settings.provider')}>
              <select
                className="select"
                value={value.provider}
                onChange={(event) => {
                  const provider = event.target.value;
                  if (provider !== 'openRouter' && provider !== 'lmStudio' && provider !== 'ollama')
                    return;
                  flushKey();
                  setKey('');
                  setModels([]);
                  setValue({ ...value, provider });
                }}
              >
                <option value="openRouter">{t('settings.openRouter')}</option>
                <option value="lmStudio">{t('settings.lmStudio')}</option>
                <option value="ollama">{t('settings.ollama')}</option>
              </select>
            </Field>
            {local && (
              <Field
                label={t(ollama ? 'settings.ollamaBaseUrl' : 'settings.lmStudioBaseUrl')}
                hint={t(ollama ? 'settings.ollamaHint' : 'settings.lmStudioHint')}
              >
                <input
                  className="input"
                  type="url"
                  value={value[baseUrlField]}
                  placeholder={DEFAULT_SETTINGS[baseUrlField]}
                  aria-invalid={
                    !settingsSchema.shape[baseUrlField].safeParse(value[baseUrlField]).success
                  }
                  onChange={(event) => {
                    setModels([]);
                    setValue({ ...value, [baseUrlField]: event.target.value });
                  }}
                />
              </Field>
            )}
            <div className="settings-key">
              <Field
                label={t(local ? 'settings.lmStudioToken' : 'settings.key')}
                hint={t(local ? 'settings.optionalTokenHint' : 'settings.keyHint')}
              >
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => {
                    const next = e.target.value;
                    keyValue.current = next;
                    setKey(next);
                    clearTimeout(keyTimer.current);
                    if (next) keyTimer.current = setTimeout(flushKey, KEY_SAVE_DELAY_MS);
                  }}
                  onBlur={flushKey}
                />
              </Field>
              {hasKey && (
                <button
                  type="button"
                  onClick={() => {
                    clearTimeout(keyTimer.current);
                    keyValue.current = '';
                    setKey('');
                    const provider = value.provider;
                    keyQueue.current = keyQueue.current.then(async () => {
                      await run(() =>
                        provider !== 'openRouter'
                          ? window.app.saveKey('', provider)
                          : window.app.saveKey(''),
                      );
                    });
                  }}
                >
                  {t(local ? 'settings.deleteToken' : 'settings.deleteKey')}
                </button>
              )}
            </div>
            <Field label={t('settings.model')}>
              <ModelSelect
                value={value[modelField]}
                models={models}
                onChange={(model) => {
                  setValue({ ...value, [modelField]: model });
                }}
              />
            </Field>
            {backgroundFields.map((field, index) => (
              <Field
                key={field}
                label={t(index === 0 ? 'settings.summaryModel' : 'settings.profileModel')}
                hint={t('settings.effectiveModel', {
                  model: value[field] || effectiveModel(value) || t('shell.noModel'),
                })}
              >
                <ModelSelect
                  value={value[field]}
                  models={models}
                  emptyLabel={t('settings.useTranslationModel')}
                  onChange={(model) => {
                    setValue({ ...value, [field]: model });
                  }}
                />
              </Field>
            ))}
            <Field
              label={t('settings.profileInputTokenLimit')}
              hint={t('settings.profileInputTokenLimitHint')}
            >
              <input
                type="number"
                required
                min={PROFILE_INPUT_TOKEN_LIMIT_MIN}
                max={PROFILE_INPUT_TOKEN_LIMIT_MAX}
                step={1}
                value={value.profileInputTokenLimit}
                onChange={(e) =>
                  setValue({
                    ...value,
                    profileInputTokenLimit: e.target.value === '' ? NaN : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field
              label={t('settings.profileLearningInterval')}
              hint={t('settings.profileLearningHint')}
            >
              <input
                type="number"
                required
                min={1}
                max={200}
                step={1}
                value={value.profileLearningInterval}
                onChange={(e) =>
                  setValue({
                    ...value,
                    profileLearningInterval: e.target.value === '' ? NaN : Number(e.target.value),
                  })
                }
              />
            </Field>
            {!models.length && (
              <p className="muted small" role="status">
                {t('settings.noModels')}
              </p>
            )}
            <div className="settings-model-actions">
              <button
                type="button"
                disabled={modelsBusy || !settingsSchema.safeParse(value).success}
                aria-label={t('settings.loadModels')}
                title={t('settings.loadModels')}
                onClick={() => {
                  void loadModels();
                }}
              >
                {modelsBusy ? (
                  <Loading />
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5M4 13a8 8 0 0 0 14 5l2-2m0 5v-5h-5" />
                  </svg>
                )}
              </button>
              <p className="muted small">
                {t(local ? 'settings.localModelHint' : 'settings.modelPriceHint')}
              </p>
            </div>
          </div>
        </section>
        <section className="settings-section settings-deduplication">
          <div>
            <h2>{t('settings.deduplication')}</h2>
          </div>
          <div className="settings-fields">
            <Field label={t('settings.duplicateThreshold')} hint={t('settings.duplicateHint')}>
              <input
                type="number"
                required
                min={0}
                max={100}
                step={1}
                value={value.duplicateThreshold}
                onChange={(e) =>
                  setValue({
                    ...value,
                    duplicateThreshold: e.target.value === '' ? NaN : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        </section>
        <section className="settings-section settings-shortcuts">
          <div>
            <h2>{t('settings.shortcuts')}</h2>
          </div>
          <div className="settings-fields">
            <Field label={t('settings.translateShortcut')}>
              <input
                required
                value={value.translateShortcut}
                onChange={(e) => setValue({ ...value, translateShortcut: e.target.value })}
              />
            </Field>
            <Field label={t('settings.pauseShortcut')}>
              <input
                required
                value={value.pauseShortcut}
                onChange={(e) => setValue({ ...value, pauseShortcut: e.target.value })}
              />
            </Field>
          </div>
        </section>
        <p className="muted small">{t('app.privacy')}</p>
        <ErrorNotice error={modelError ?? error} />
      </form>
    </>
  );
}
