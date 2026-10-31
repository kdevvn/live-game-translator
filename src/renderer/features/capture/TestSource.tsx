import { useEffect, useState } from 'react';
import { TEST_DIALOGUES } from '../../../shared/defaults';

/** Nguồn phụ đề thử xác định, không giả lập kết quả OCR hoặc API dịch. */
export function TestSource() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % TEST_DIALOGUES.length), 7000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="test-source">
      <div className="test-scene">
        <span>Live Game Translator</span>
        <h1>The Northern Gate</h1>
        <p>English subtitle capture fixture · 7s / line</p>
      </div>
      <div className="test-subtitle">{TEST_DIALOGUES[index]}</div>
    </div>
  );
}
