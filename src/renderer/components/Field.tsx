import { cloneElement, isValidElement, useId, useState } from 'react';
import type { ReactElement, InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Giữ bản nháp số khi gõ, kể cả khi bên gọi chuẩn hóa giá trị ngay trong onChange.
 * Khi rời ô, đưa số ngoài giới hạn về biên gần nhất; ô trống về min hoặc 0 trong giới hạn.
 * Chuyển giá trị đã sửa qua onChange trước khi gọi onBlur để state và tự lưu cùng cập nhật.
 */
function NumberControl({
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  min,
  max,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [draft, setDraft] = useState(String(value ?? defaultValue ?? ''));
  const [editing, setEditing] = useState(false);
  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      value={editing || value === undefined ? draft : value}
      onFocus={(event) => {
        setDraft(String(value ?? draft));
        setEditing(true);
        onFocus?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange?.(event);
      }}
      onBlur={(event) => {
        const input = event.currentTarget;
        const lower = min === undefined || min === '' ? -Infinity : Number(min);
        const upper = max === undefined || max === '' ? Infinity : Number(max);
        const current = input.valueAsNumber;
        const next = Math.min(
          upper,
          Math.max(lower, Number.isFinite(current) ? current : Number.isFinite(lower) ? lower : 0),
        );
        if (Number.isFinite(next) && (input.value === '' || current !== next)) {
          input.value = String(next);
          onChange?.(event);
        }
        setDraft(input.value);
        setEditing(false);
        onBlur?.(event);
      }}
    />
  );
}

/** Nhãn control có mô tả truy cập; ô số luôn hiện giới hạn và tự sửa ngoài ngưỡng khi rời ô. */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactElement<{ id?: string; className?: string; 'aria-describedby'?: string }>;
  hint?: string;
}) {
  const id = useId();
  const { t } = useTranslation();
  const numberInput =
    children.type === 'input' &&
    isValidElement<InputHTMLAttributes<HTMLInputElement>>(children) &&
    children.props.type === 'number'
      ? children
      : null;
  const min = numberInput?.props.min;
  const max = numberInput?.props.max;
  const range =
    min !== undefined && max !== undefined
      ? t('field.range', { min, max })
      : min !== undefined
        ? t('field.minimum', { min })
        : max !== undefined
          ? t('field.maximum', { max })
          : undefined;
  const description =
    [children.props['aria-describedby'], range ? `${id}-range` : '', hint ? `${id}-hint` : '']
      .filter(Boolean)
      .join(' ') || undefined;
  const className = [
    children.type === 'select'
      ? 'select'
      : children.type === 'textarea'
        ? 'textarea'
        : children.type === 'input' &&
            !['checkbox', 'range'].includes((children.props as { type?: string }).type ?? '')
          ? 'input'
          : '',
    children.props.className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {numberInput ? (
        <NumberControl
          {...numberInput.props}
          id={id}
          className={className}
          aria-describedby={description}
        />
      ) : (
        cloneElement(children, {
          id,
          className,
          'aria-describedby': description,
        })
      )}
      {range && <small id={`${id}-range`}>{range}</small>}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
