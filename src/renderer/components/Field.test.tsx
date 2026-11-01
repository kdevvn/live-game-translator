// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Field } from './Field';
import { useState } from 'react';
import { initializeI18n } from '../i18n';

beforeEach(async () => {
  await initializeI18n();
});
afterEach(cleanup);

/** Ô số có state để kiểm chứng giá trị thực sự được cập nhật sau khi rời ô. */
function NumberExample({ onBlur = () => {} }: { onBlur?: () => void }) {
  const [value, setValue] = useState('20');
  return (
    <Field label="Số lượng" hint="Mô tả nghiệp vụ">
      <input
        type="number"
        min={10}
        max={30}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={onBlur}
      />
    </Field>
  );
}

describe('Nhãn control', () => {
  it('tên truy cập chỉ chứa nhãn, tách nội dung option và trợ giúp', () => {
    render(
      <Field label="Chủ đề" hint="Theo màu Windows">
        <select defaultValue="light">
          <option value="light">Sáng</option>
          <option value="dark">Tối</option>
        </select>
      </Field>,
    );
    expect(screen.getByRole('combobox', { name: 'Chủ đề' })).toBeTruthy();
    cleanup();
  });
});

it.each([
  ['5', '10'],
  ['40', '30'],
  ['20', '20'],
  ['', '10'],
])('giữ bản nháp %s khi nhập và chuẩn hóa thành %s khi rời ô', (draft, expected) => {
  const onBlur = vi.fn();
  render(<NumberExample onBlur={onBlur} />);
  const input = screen.getByRole('spinbutton', { name: 'Số lượng' }) as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: draft } });
  expect(input.value).toBe(draft);
  fireEvent.blur(input);
  expect(input.value).toBe(expected);
  expect(onBlur).toHaveBeenCalledOnce();
});
it.each([
  ['vi', 'Giới hạn: 10–30.'],
  ['en', 'Range: 10–30.'],
])('hiện giới hạn và giữ mô tả truy cập bằng %s', async (locale, caption) => {
  await initializeI18n(locale);
  render(<NumberExample />);
  const input = screen.getByRole('spinbutton', { name: 'Số lượng' });
  const range = screen.getByText(caption);
  expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(range.id);
  expect(screen.getByText('Mô tả nghiệp vụ')).toBeTruthy();
});
