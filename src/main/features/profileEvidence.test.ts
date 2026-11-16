import { describe, expect, it } from 'vitest';
import { filterProfileEvidence } from './profileLearning';
import { DEFAULT_PROFILE } from '../../shared/defaults';
import { openDatabase } from '../database';

describe('Lọc dữ kiện AI theo hội thoại', () => {
  const facts = {
    characters: [{ name: 'Alice', aliases: 'ALICE, Ally' }],
    relationships: [
      { speaker: 'Alice', listener: 'Bob', self: 'Tôi / ta', address: 'em hoặc con' },
    ],
    evidence: 'test',
  };
  it('yêu cầu bốn câu khác nhau, chấp nhận biệt danh và chuẩn hóa xưng hô', () => {
    const lines = [
      'Ally found the gate.',
      'ALICE sees the tower!',
      'Ally opens the door.',
      'Alice closed the gate.',
    ];
    const result = filterProfileEvidence(facts, lines);
    expect(result.characters).toEqual([{ name: 'Alice', aliases: 'Ally' }]);
    expect(result.relationships[0]).toMatchObject({ self: 'Tôi', address: 'em' });
    expect(filterProfileEvidence(facts, lines.slice(0, 3)).characters).toEqual([]);
  });
  it('không tính câu trùng hoặc tên nằm trong từ dài hơn', () => {
    const lines = [
      'Alice at the gate',
      '  ALICE  AT THE GATE ',
      'Malice at the tower',
      'Allyson returns',
    ];
    expect(filterProfileEvidence(facts, lines).characters).toEqual([]);
  });
  it('không tạo đề xuất biệt danh khi nhân vật chưa đủ bằng chứng', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        characters: [{ id: 'a', name: 'Alice', aliases: 'Alicia' }],
      });
      db.applyProfileEnrichment('game', 0, facts);
      expect(db.profileProposals('game')).toEqual([]);
      expect(db.profiles().find((profile) => profile.id === 'game')?.characters).toEqual([
        { id: 'a', name: 'Alice', aliases: 'Alicia' },
      ]);
    } finally {
      db.close();
    }
  });
  it('đếm bằng chứng qua các phiên, giữ lịch sử khi xóa dữ kiện và chỉ tính câu dịch thành công', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', instructions: 'Giữ nguyên' });
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'other' });
      const a = db.createSession('game');
      const b = db.createSession('game');
      const other = db.createSession('other');
      /** Lưu câu gốc để kiểm tra phạm vi hồ sơ và trạng thái đóng góp bằng chứng. */
      function add(
        id: string,
        sessionId: string,
        sequence: number,
        text: string,
        status: 'translated' | 'error' = 'translated',
      ): void {
        db.saveDialogue({
          id,
          sessionId,
          sequence,
          text,
          status,
          translation: status === 'translated' ? 'Dịch' : '',
          speaker: 'unknown',
          listener: 'unknown',
          createdAt: 0,
          ocrMs: 0,
          apiMs: 0,
        });
      }
      add('one', a.id, 1, 'Ally found the gate.');
      add('two', a.id, 2, 'Alice sees the tower.');
      add('three', b.id, 1, 'Ally opens the door.');
      add('duplicate', b.id, 2, '  ALLY found   the gate. ');
      add('other-profile', other.id, 1, 'Ally closes the gate.');
      add('failed', b.id, 3, 'Alice closes the gate.', 'error');
      db.applyProfileEnrichment('game', 0, facts);
      expect(db.profiles().find((profile) => profile.id === 'game')?.characters).toEqual([]);
      db.clearProfile('game', 1);
      add('four', b.id, 4, 'Alice closes the gate.');
      db.applyProfileEnrichment('game', 2, facts);
      const result = db.profiles().find((profile) => profile.id === 'game')!;
      expect(result.instructions).toBe('Giữ nguyên');
      expect(result.characters[0]).toMatchObject({ name: 'Alice', aliases: 'Ally' });
      expect(result.relationships[0]).toMatchObject({ self: 'Tôi', address: 'em' });
    } finally {
      db.close();
    }
  });
});
