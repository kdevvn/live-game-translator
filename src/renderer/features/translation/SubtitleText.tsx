import type { SessionSnapshot } from '../../../shared/types';
import { getOverlaySpeaker } from '../../../shared/overlay';

/** Hiện tên người nói ngay trước lời thoại, dùng chung cho overlay và phụ đề trong màn hình dịch. */
export function SubtitleText({ snapshot }: { snapshot: SessionSnapshot }) {
  const speaker = getOverlaySpeaker(snapshot);
  return (
    <>
      {speaker && (
        <>
          <span className="subtitle-speaker">{speaker}</span>{' '}
        </>
      )}
      {snapshot.overlayText}
    </>
  );
}
