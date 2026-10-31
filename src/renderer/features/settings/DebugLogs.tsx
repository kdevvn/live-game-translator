import { Loading } from '../../components/Loading';
import { useTranslation } from 'react-i18next';
import type { DebugEntry } from '../../../shared/types';

/** Danh sách request tạm thời, mở từng dòng để xem dữ liệu chi tiết. */
export function DebugLogs({
  entries,
  clear,
  loading = false,
}: {
  entries: DebugEntry[];
  clear: () => void;
  loading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section className="debug-logs">
      <div className="debug-heading">
        <div>
          <h1>
            {t('debug.title')} {loading && <Loading />}
          </h1>
          <p>{t('debug.description')}</p>
        </div>
        <button type="button" onClick={clear} disabled={!entries.length || loading}>
          {t('debug.clear')}
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="debug-empty">{t('debug.empty')}</p>
      ) : (
        <div className="debug-list">
          {entries.map((entry) => (
            <details key={entry.id} className="debug-entry">
              <summary>
                <span className="debug-path">{entry.path}</span>
                <span className={`debug-status ${entry.status}`}>
                  {entry.status === 'pending' && <Loading />} {t(`debug.${entry.status}`)}
                  {entry.httpStatus ? ` · ${entry.httpStatus}` : ''}
                </span>
                <time dateTime={new Date(entry.startedAt).toISOString()}>
                  {new Date(entry.startedAt).toLocaleTimeString(i18n.language)}
                </time>
              </summary>
              <div className="debug-detail">
                {entry.error && (
                  <p className="debug-error">
                    {t('debug.errorCode')}: {entry.error}
                  </p>
                )}
                <h2>{t('debug.request')}</h2>
                <pre>{entry.request}</pre>
                <h2>{t('debug.response')}</h2>
                <pre>{entry.response || t('debug.noResponse')}</pre>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
