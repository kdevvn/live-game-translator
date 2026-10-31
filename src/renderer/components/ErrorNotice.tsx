import { useTranslation } from 'react-i18next';
import type { AppError } from '../../shared/types';

/** Hiển thị mã lỗi theo locale; không render dữ liệu lỗi thô từ bên ngoài. */
export function ErrorNotice({ error }: { error: AppError | null }) {
  const { t } = useTranslation();
  return error ? (
    <p className="error" role="alert">
      {t(`errors.${error}`)}
    </p>
  ) : null;
}
