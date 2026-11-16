import { cloneElement, useId } from 'react';
import type { ReactElement } from 'react';

/** Liên kết nhãn và trợ giúp với control nhập liệu; ô chọn dùng component Checkbox riêng. */
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
  const control = cloneElement(children, {
    id,
    className: [
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
      .join(' '),
    'aria-describedby': hint ? `${id}-hint` : undefined,
  });
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
