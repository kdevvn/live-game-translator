import { useTranslation } from 'react-i18next';

/** Icon thông báo thao tác đang xử lý, dùng màu theo giao diện hiện tại. */
export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className="loading loading-spinner loading-xs"
      role="status"
      aria-label={label ?? t('app.processing')}
    />
  );
}
