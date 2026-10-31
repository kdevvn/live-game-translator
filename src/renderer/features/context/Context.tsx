import { Loading } from '../../components/Loading';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameProfile, SessionSnapshot } from '../../../shared/types';
import { DEFAULT_PROFILE } from '../../../shared/defaults';
import { Field } from '../../components/Field';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useAction } from '../../components/useAction';
import { ProfileAi } from './ProfileAi';

const LAST_PROFILE_KEY = 'lastSelectedProfile';

/** Chỉnh hồ sơ như một document, lưu nguyên tử để quan hệ không bị áp dụng nửa chừng. */
export function Context({ snapshot }: { snapshot: SessionSnapshot }) {
  const { t } = useTranslation();
  const [draft, setProfile] = useState<GameProfile>(
    snapshot.profiles.find((p) => p.id === snapshot.session?.profileId) ??
      snapshot.profiles.find((p) => p.id === localStorage.getItem(LAST_PROFILE_KEY)) ??
      snapshot.profiles[0] ?? {
        ...DEFAULT_PROFILE,
        id: crypto.randomUUID(),
        name: '',
        aiEnabled: true,
      },
  );
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const latest = snapshot.profiles.find((item) => item.id === draft.id);
  const profile = dirty ? draft : (latest ?? draft);
  const stale = dirty && latest && latest.revision !== draft.revision;
  const { run, error, busy } = useAction();
  /** Thay một trường trong hồ sơ đang sửa và đánh dấu chưa lưu. */
  function update(value: Partial<GameProfile>): void {
    setProfile({ ...profile, ...value });
    setDirty(true);
    setSaved(false);
  }
  /** Lưu hồ sơ thông qua main để phiên đang dùng được vô hiệu hóa đúng lúc. */
  async function save(): Promise<void> {
    if (stale) return;
    const result = await run(() => window.app.saveProfile(profile));
    if (result.ok) {
      localStorage.setItem(LAST_PROFILE_KEY, profile.id);
      if (snapshot.session?.profileId !== profile.id)
        await run(() => window.app.session(profile.id));
      setSaved(true);
      setDirty(false);
    }
  }
  /** Xóa có xác nhận tên hồ sơ và dữ liệu liên quan. */
  async function remove(): Promise<void> {
    if (!window.confirm(t('app.confirmDelete', { name: profile.name }))) return;
    const result = await run(() => window.app.deleteProfile(profile.id));
    if (result.ok) {
      localStorage.removeItem(LAST_PROFILE_KEY);
      setProfile({ ...DEFAULT_PROFILE, id: crypto.randomUUID(), name: '', aiEnabled: true });
      setDirty(false);
    }
  }
  /** Xóa dữ kiện đã lưu sau xác nhận, giữ quy tắc và bảo vệ bản nháp đang sửa. */
  async function clear(): Promise<void> {
    if (dirty || stale || !latest) return;
    if (!window.confirm(t('context.confirmClear', { name: profile.name }))) return;
    const result = await run(() => window.app.clearProfile(profile.id, profile.revision));
    if (result.ok) setSaved(false);
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('context.title')}</h1>
          <p>{t('context.subtitle')}</p>
        </div>
        <div className="actions">
          {saved && <span role="status">{t('app.saved')}</span>}
          <button
            type="button"
            onClick={() => {
              setProfile({
                ...DEFAULT_PROFILE,
                id: crypto.randomUUID(),
                name: '',
                aiEnabled: true,
              });
              setDirty(true);
              setSaved(false);
            }}
          >
            {t('context.new')}
          </button>
          <button
            className="primary"
            type="submit"
            form="profile-form"
            disabled={busy || Boolean(stale)}
            aria-busy={busy}
          >
            {busy && <Loading />} {t('app.save')}
          </button>
        </div>
      </header>
      <Field label={t('context.select')}>
        <select
          value={snapshot.profiles.some((p) => p.id === profile.id) ? profile.id : ''}
          onChange={(e) => {
            const found = snapshot.profiles.find((p) => p.id === e.target.value);
            if (found) {
              localStorage.setItem(LAST_PROFILE_KEY, found.id);
              setProfile(found);
              if (snapshot.session?.profileId !== found.id)
                void run(() => window.app.session(found.id));
              setDirty(false);
              setSaved(false);
            }
          }}
        >
          <option value="" disabled>
            {t('context.new')}
          </option>
          {snapshot.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {stale && latest && (
        <div className="profile-section" role="alert">
          <p>{t('context.changedElsewhere')}</p>
          <button
            type="button"
            onClick={() => {
              setProfile(latest);
              setDirty(false);
              setSaved(false);
            }}
          >
            {t('context.reload')}
          </button>
        </div>
      )}
      <form
        id="profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="profile-basics">
          <Field label={t('context.name')}>
            <input
              required
              maxLength={100}
              value={profile.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
          <Field label={t('context.aiEnabled')} hint={t('context.aiToggleHint')}>
            <input
              type="checkbox"
              checked={profile.aiEnabled ?? profile.id !== 'general'}
              onChange={(e) => update({ aiEnabled: e.target.checked })}
            />
          </Field>
          <Field label={t('context.instructions')} hint={t('context.instructionsHint')}>
            <textarea
              maxLength={4000}
              value={profile.instructions}
              onChange={(e) => update({ instructions: e.target.value })}
            />
          </Field>
        </div>
        <ProfileAi
          snapshot={snapshot}
          profile={profile}
          dirty={dirty}
          clearDisabled={busy || dirty || Boolean(stale) || !latest}
          clear={() => {
            void clear();
          }}
        />
        <section className="profile-section profile-characters">
          <div className="section-heading">
            <h2>{t('context.characters')}</h2>
            <button
              type="button"
              onClick={() =>
                update({
                  characters: [
                    ...profile.characters,
                    { id: crypto.randomUUID(), name: '', aliases: '' },
                  ],
                })
              }
            >
              {t('app.add')}
            </button>
          </div>
          {!profile.characters.length && <p className="muted">{t('context.empty')}</p>}
          {profile.characters.map((character, index) => (
            <div className="editable-row" key={character.id}>
              <Field label={t('context.characterName')}>
                <input
                  required
                  value={character.name}
                  onChange={(e) =>
                    update({
                      characters: profile.characters.map((c, i) =>
                        i === index ? { ...c, name: e.target.value } : c,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={t('context.aliases')}>
                <input
                  value={character.aliases}
                  onChange={(e) =>
                    update({
                      characters: profile.characters.map((c, i) =>
                        i === index ? { ...c, aliases: e.target.value } : c,
                      ),
                    })
                  }
                />
              </Field>
              <button
                type="button"
                onClick={() =>
                  update({ characters: profile.characters.filter((_, i) => i !== index) })
                }
              >
                {t('app.delete')}
              </button>
            </div>
          ))}
        </section>
        <section className="profile-section profile-relations">
          <div className="section-heading">
            <div>
              <h2>{t('context.relationships')}</h2>
              <p className="muted small">{t('context.direction')}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                update({
                  relationships: [
                    ...profile.relationships,
                    { speaker: '', listener: '', self: '', address: '' },
                  ],
                })
              }
            >
              {t('app.add')}
            </button>
          </div>
          {!profile.relationships.length && <p className="muted">{t('context.empty')}</p>}
          {profile.relationships.map((relation, index) => (
            <div className="editable-row relations" key={index}>
              {(['speaker', 'listener', 'self', 'address'] as const).map((key) => (
                <Field
                  key={key}
                  label={t(
                    key === 'speaker' || key === 'listener'
                      ? `translation.${key}`
                      : `context.${key}`,
                  )}
                >
                  <input
                    required
                    value={relation[key]}
                    onChange={(e) =>
                      update({
                        relationships: profile.relationships.map((r, i) =>
                          i === index ? { ...r, [key]: e.target.value } : r,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
              <button
                type="button"
                onClick={() =>
                  update({ relationships: profile.relationships.filter((_, i) => i !== index) })
                }
              >
                {t('app.delete')}
              </button>
            </div>
          ))}
        </section>
        <section className="profile-section profile-glossary">
          <div className="section-heading">
            <h2>{t('context.glossary')}</h2>
            <button
              type="button"
              onClick={() =>
                update({ glossary: [...profile.glossary, { source: '', target: '' }] })
              }
            >
              {t('app.add')}
            </button>
          </div>
          {!profile.glossary.length && <p className="muted">{t('context.empty')}</p>}
          {profile.glossary.map((term, index) => (
            <div className="editable-row" key={index}>
              <Field label={t('context.original')}>
                <input
                  required
                  value={term.source}
                  onChange={(e) =>
                    update({
                      glossary: profile.glossary.map((g, i) =>
                        i === index ? { ...g, source: e.target.value } : g,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={t('context.translated')}>
                <input
                  required
                  value={term.target}
                  onChange={(e) =>
                    update({
                      glossary: profile.glossary.map((g, i) =>
                        i === index ? { ...g, target: e.target.value } : g,
                      ),
                    })
                  }
                />
              </Field>
              <button
                type="button"
                onClick={() => update({ glossary: profile.glossary.filter((_, i) => i !== index) })}
              >
                {t('app.delete')}
              </button>
            </div>
          ))}
        </section>
        <p className="muted small">{t('context.savedHint')}</p>
        <ErrorNotice error={error} />
        <div className="actions">
          {latest && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void remove();
              }}
            >
              {t('app.delete')}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
