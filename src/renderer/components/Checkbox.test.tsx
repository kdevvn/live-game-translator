// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Checkbox } from './Checkbox';

afterEach(cleanup);

describe('Checkbox dùng chung', () => {
  it('nhấp nhãn gửi trạng thái mới và hiển thị theo giá trị cha truyền xuống', () => {
    const change = vi.fn();
    const { rerender } = render(
      <Checkbox label="Dùng tóm tắt" checked={false} onChange={change} />,
    );
    const input = screen.getByRole('checkbox', { name: 'Dùng tóm tắt' }) as HTMLInputElement;
    fireEvent.click(screen.getByText('Dùng tóm tắt'));
    expect(change).toHaveBeenLastCalledWith(true);
    expect(input.checked).toBe(false);
    rerender(<Checkbox label="Dùng tóm tắt" checked onChange={change} />);
    expect(input.checked).toBe(true);
    fireEvent.click(input);
    expect(change).toHaveBeenLastCalledWith(false);
  });

  it('khóa cả nhãn và ô chọn khi disabled, giữ thuộc tính form', () => {
    const change = vi.fn();
    render(
      <Checkbox
        label="Dịch tự động"
        checked={false}
        disabled
        required
        name="automatic"
        onChange={change}
      />,
    );
    const input = screen.getByRole('checkbox', { name: 'Dịch tự động' }) as HTMLInputElement;
    fireEvent.click(screen.getByText('Dịch tự động'));
    fireEvent.click(input);
    expect(change).not.toHaveBeenCalled();
    expect(input.disabled).toBe(true);
    expect(input.required).toBe(true);
    expect(input.name).toBe('automatic');
  });

  it('liên kết trợ giúp riêng cho mỗi checkbox và giữ mô tả bên ngoài', () => {
    render(
      <>
        <p id="external-help">Mô tả chung</p>
        <Checkbox
          id="summary"
          label="Tóm tắt"
          hint="Nhớ hội thoại cũ"
          aria-describedby="external-help"
          checked={false}
          onChange={() => undefined}
        />
        <Checkbox label="Hồ sơ AI" hint="Học nhân vật" checked onChange={() => undefined} />
      </>,
    );
    const summary = screen.getByRole('checkbox', { name: 'Tóm tắt' });
    const profile = screen.getByRole('checkbox', { name: 'Hồ sơ AI' });
    expect(summary.id).toBe('summary');
    expect(profile.id).not.toBe(summary.id);
    const descriptions = summary.getAttribute('aria-describedby')!.split(' ');
    expect(descriptions.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Mô tả chung',
      'Nhớ hội thoại cũ',
    ]);
    expect(document.getElementById(profile.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Học nhân vật',
    );
  });
});
