// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_REGION, DEFAULT_SETTINGS } from '../../../shared/defaults';
import type { SessionSnapshot } from '../../../shared/types';
import { Translation } from './Translation';

vi.mock('../capture/Capture', () => ({ Capture: () => null }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

it('giữ bản nháp và tóm tắt cũ cùng icon khi đang xử lý, rồi bỏ icon khi hoàn tất', () => {
  const snapshot: SessionSnapshot = {
    settings: DEFAULT_SETTINGS,
    resolvedTheme: 'light',
    hasApiKey: false,
    profiles: [DEFAULT_PROFILE],
    sessions: [],
    session: {
      id: 's',
      profileId: DEFAULT_PROFILE.id,
      summary: 'Tóm tắt cũ',
      summarizedThrough: 0,
      createdAt: 0,
    },
    status: 'idle',
    dialogues: [
      {
        id: 'd',
        sessionId: 's',
        sequence: 1,
        text: 'Hello',
        translation: 'Bản nháp',
        speaker: 'unknown',
        listener: 'unknown',
        status: 'pending',
        createdAt: 0,
        ocrMs: 0,
        apiMs: 0,
      },
    ],
    ocrText: '',
    error: null,
    overlayEditing: false,
    overlayText: '',
    generation: 0,
    sourceId: '',
    sourceName: '',
    region: DEFAULT_REGION,
    summaryLoading: true,
  };
  const { rerender } = render(<Translation snapshot={snapshot} />);
  expect(screen.getByText('Tóm tắt cũ')).toBeTruthy();
  expect(screen.getByText('Bản nháp')).toBeTruthy();
  expect(screen.getAllByRole('status', { name: 'app.processing' })).toHaveLength(2);
  rerender(
    <Translation
      snapshot={{
        ...snapshot,
        summaryLoading: false,
        dialogues: [{ ...snapshot.dialogues[0], status: 'translated' }],
      }}
    />,
  );
  expect(screen.queryByRole('status', { name: 'app.processing' })).toBeNull();
});
