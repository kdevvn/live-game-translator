import { cloneElement, useId } from 'react';
import type { ReactElement } from 'react';

/** Nhãn bao input giúp control có accessible name và spacing nhất quán. */
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
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
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
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
