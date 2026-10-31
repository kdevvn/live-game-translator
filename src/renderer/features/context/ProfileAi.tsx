import { Loading } from '../../components/Loading';
import { effectiveModel, hasProviderAccess } from '../../../shared/modelSettings';
import { useTranslation } from 'react-i18next';
import { profileSchema } from '../../../shared/types';
import type { GameProfile, ProfileProposal, SessionSnapshot } from '../../../shared/types';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useAction } from '../../components/useAction';

/** Định dạng dữ kiện đề xuất bằng nội dung nghiệp vụ, không đưa ID quản lý lên màn hình. */
function proposalText(proposal: ProfileProposal, value: string): string {
  const data: unknown = JSON.parse(value);
  if (proposal.field === 'instructions') return profileSchema.shape.instructions.parse(data);
  if (proposal.field === 'characters') {
    const rows = proposal.key
      ? [profileSchema.shape.characters.element.parse(data)]
      : profileSchema.shape.characters.parse(data);
    return rows.map((row) => [row.name, row.aliases].filter(Boolean).join(' · ')).join('\n');
  }
  if (proposal.field === 'relationships') {
    const rows = proposal.key
      ? [profileSchema.shape.relationships.element.parse(data)]
      : profileSchema.shape.relationships.parse(data);
    return rows
      .map((row) => `${row.speaker} → ${row.listener}: ${row.self} / ${row.address}`)
      .join('\n');
  }
  const row = profileSchema.shape.glossary.element.parse(data);
  return `${row.source} → ${row.target}`;
}

/** Tiến độ và các đề xuất AI độc lập với bản hồ sơ người dùng đang nhập. */
export function ProfileAi({
  snapshot,
  profile,
  dirty,
  clearDisabled,
  clear,
}: {
  snapshot: SessionSnapshot;
  profile: GameProfile;
  dirty: boolean;
  clearDisabled: boolean;
  clear: () => void;
}) {
  const { t } = useTranslation();
  const { run, error, busy } = useAction();
  const { run: retry, error: retryError, busy: retryBusy } = useAction();
  const task = snapshot.profileTasks?.find((item) => item.profileId === profile.id);
  const proposals =
    snapshot.profileProposals?.filter((item) => item.profileId === profile.id) ?? [];
  const enabled = profile.aiEnabled ?? profile.id !== 'general';
  const exists = snapshot.profiles.some((item) => item.id === profile.id);
  return (
    <section className="profile-section" aria-label={t('context.aiTitle')}>
      <div className="section-heading">
        <h2>{t('context.aiTitle')}</h2>
        <div className="actions">
          <button
            type="button"
            className="btn btn-error btn-sm"
            disabled={clearDisabled}
            onClick={clear}
          >
            {t('context.clearProfile')}
          </button>
          <button
            type="button"
            disabled={
              !exists ||
              !enabled ||
              busy ||
              retryBusy ||
              dirty ||
              task?.status === 'running' ||
              task?.status === 'queued'
            }
            aria-busy={retryBusy || task?.status === 'running' || task?.status === 'queued'}
            onClick={() => {
              void retry(() => window.app.retryProfile(profile.id));
            }}
          >
            {t('app.retry')}
          </button>
        </div>
      </div>
      <p className="muted small">{t('context.aiHint')}</p>
      <p>
        {(retryBusy || task?.status === 'queued' || task?.status === 'running') && <Loading />}
        {t(
          `context.aiStatus.${!enabled ? 'disabled' : retryBusy ? 'queued' : task?.status === 'no_data' || task?.status === 'cleared' ? task.status : !hasProviderAccess(snapshot.settings, snapshot.hasApiKey) || !effectiveModel(snapshot.settings, 'profile') ? 'waiting' : (task?.status ?? 'waiting')}`,
        )}
      </p>
      <ErrorNotice
        error={
          retryBusy || task?.status === 'queued' || task?.status === 'running'
            ? null
            : (task?.error ?? retryError ?? error)
        }
      />
      {proposals.length > 0 && <h3>{t('context.proposals', { count: proposals.length })}</h3>}
      {proposals.map((proposal) => (
        <article className="profile-proposal" key={proposal.id}>
          <h4>{t(`context.${proposal.field}`)}</h4>
          <dl>
            <dt>{t('context.currentValue')}</dt>
            <dd>{proposalText(proposal, proposal.before)}</dd>
            <dt>{t('context.proposedValue')}</dt>
            <dd>{proposalText(proposal, proposal.after)}</dd>
          </dl>
          <p className="muted small">{proposal.evidence}</p>
          <div className="actions">
            <button
              type="button"
              disabled={busy || dirty}
              onClick={() => {
                void run(() => window.app.resolveProfileProposal(proposal.id, 'accept'));
              }}
            >
              {t('context.accept')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void run(() => window.app.resolveProfileProposal(proposal.id, 'reject'));
              }}
            >
              {t('context.reject')}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
