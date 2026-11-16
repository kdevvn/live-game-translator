import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

/** Checkbox có trạng thái do nơi sử dụng quản lý, kèm nhãn và trợ giúp tùy chọn. */
export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'defaultChecked' | 'onChange' | 'size' | 'children'
> {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Ô chọn thống nhất toàn ứng dụng; giữ hành vi bàn phím và thuộc tính form của input native. */
export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  id: providedId,
  className,
  'aria-describedby': describedBy,
  ...inputProps
}: CheckboxProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const description = [describedBy, hint ? `${id}-hint` : undefined].filter(Boolean).join(' ');
  return (
    <div className="field checkbox-field">
      <label className="check-row" htmlFor={id}>
        <input
          {...inputProps}
          id={id}
          type="checkbox"
          className={['checkbox checkbox-sm', className].filter(Boolean).join(' ')}
          checked={checked}
          onChange={(event) => {
            if (!inputProps.disabled) onChange(event.target.checked);
          }}
          aria-describedby={description || undefined}
        />
        <span>{label}</span>
      </label>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
