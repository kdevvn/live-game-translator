// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Field } from './Field';

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
