import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelOption } from '../../../shared/types';

/** Dropdown chỉ thay đổi model khi người dùng xác nhận một option. */
interface ModelSelectProps {
  id?: string;
  'aria-describedby'?: string;
  value: string;
  models: ModelOption[];
  emptyLabel?: string;
  onChange: (id: string) => void;
}

/** Combobox tìm theo tên/ID, ưu tiên miễn phí, hỗ trợ chuột và bàn phím. */
export function ModelSelect({
  id,
  'aria-describedby': describedBy,
  value,
  models,
  emptyLabel,
  onChange,
}: ModelSelectProps) {
  const { t } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const selected = models.find((model) => model.id === value);
  const available: ModelOption[] =
    value && !selected
      ? [
          ...models,
          {
            id: value,
            name: value,
            contextLength: 0,
            isFree: false,
            supportsStructuredOutputs: false,
          },
        ]
      : models;
  const search = query.trim().toLocaleLowerCase();
  const filtered = available
    .filter((model) => `${model.name} ${model.id}`.toLocaleLowerCase().includes(search))
    .sort(
      (a, b) =>
        Number(b.isFree) - Number(a.isFree) ||
        (a.inputPricePerMillion ?? Infinity) +
          (a.outputPricePerMillion ?? Infinity) -
          ((b.inputPricePerMillion ?? Infinity) + (b.outputPricePerMillion ?? Infinity)) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
  const options: ModelOption[] = search
    ? filtered
    : [
        ...filtered,
        {
          id: '',
          name: emptyLabel ?? t('settings.chooseModel'),
          contextLength: 0,
          isFree: false,
          supportsStructuredOutputs: false,
        },
      ];
  const activeIndex = Math.min(active, options.length - 1);

  useEffect(() => {
    if (open)
      list.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open, query]);

  /** Mở danh sách mà không thay model đã chọn trong form. */
  function show(): void {
    setOpen(true);
    setQuery('');
    setActive(0);
  }
  /** Chỉ lưu ID của option; chuỗi tìm kiếm không thể trở thành ID model. */
  function choose(modelId: string): void {
    onChange(modelId);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="model-select" onBlur={() => setOpen(false)}>
      <div className="model-select-control">
        <input
          id={id}
          role="combobox"
          autoComplete="off"
          aria-describedby={describedBy}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder={
            open ? t('settings.searchModels') : (emptyLabel ?? t('settings.chooseModel'))
          }
          value={open ? query : (selected?.name ?? value)}
          onFocus={show}
          onClick={() => {
            if (!open) show();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) show();
              else
                setActive(
                  Math.max(
                    0,
                    Math.min(
                      options.length - 1,
                      activeIndex + (event.key === 'ArrowDown' ? 1 : -1),
                    ),
                  ),
                );
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (options[activeIndex]) choose(options[activeIndex].id);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === 'Tab') setOpen(false);
          }}
        />
        <svg className="model-select-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </div>
      {open && (
        <div
          className="model-select-menu"
          id={listId}
          role="listbox"
          ref={list}
          aria-label={t('settings.model')}
        >
          {options.map((model, index) => (
            <button
              key={model.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={model.id === value}
              data-active={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(model.id)}
            >
              <span className="model-select-name">
                {model.name}
                {model.id && <small>{model.id}</small>}
                {model.id && (
                  <small>
                    {t('settings.modelPrice', {
                      input:
                        model.inputPricePerMillion === undefined
                          ? '—'
                          : `$${model.inputPricePerMillion.toLocaleString(undefined, { maximumFractionDigits: 8 })}`,
                      output:
                        model.outputPricePerMillion === undefined
                          ? '—'
                          : `$${model.outputPricePerMillion.toLocaleString(undefined, { maximumFractionDigits: 8 })}`,
                    })}
                  </small>
                )}
              </span>
              {model.isFree && <span className="model-select-free">{t('settings.freeModel')}</span>}
            </button>
          ))}
          {!options.length && (
            <p className="model-select-empty" role="status">
              {t('settings.noModels')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
