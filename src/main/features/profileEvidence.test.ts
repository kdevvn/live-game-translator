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
    glossary: [
      { source: 'Star Gate', target: 'Cổng Sao' },
      { source: 'Ally', target: 'Bạn' },
    ],
    evidence: 'test',
  };
  it('yêu cầu bốn câu khác nhau, chấp nhận tên hoặc biệt danh, bỏ tên khỏi thuật ngữ', () => {
    const lines = [
      'Ally found Star Gate.',
      'ALICE sees star   gate!',
      'Ally opens Star Gate.',
      'Alice closed Star Gate.',
    ];
    const result = filterProfileEvidence(DEFAULT_PROFILE, facts, lines);
    expect(result.characters).toEqual([{ name: 'Alice', aliases: 'Ally' }]);
    expect(result.glossary).toEqual([{ source: 'Star Gate', target: 'Cổng Sao' }]);
    expect(result.relationships[0]).toMatchObject({ self: 'Tôi', address: 'em' });
    expect(filterProfileEvidence(DEFAULT_PROFILE, facts, lines.slice(0, 3)).characters).toEqual([]);
    expect(filterProfileEvidence(DEFAULT_PROFILE, facts, lines.slice(0, 3)).glossary).toEqual([]);
  });
  it('không tính câu trùng hoặc từ nằm trong từ dài hơn', () => {
    const lines = [
      'Alice at Star Gate',
      '  ALICE  AT STAR GATE ',
      'Alice at Star Gateway',
      'Malice at Star Gateway',
    ];
    const result = filterProfileEvidence(DEFAULT_PROFILE, facts, lines);
    expect(result.characters).toEqual([]);
    expect(result.glossary).toEqual([]);
  });
  it('loại tên và biệt danh ở cả hai phía, kể cả nhân vật AI chưa đủ điều kiện', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      characters: [{ id: 'one', name: 'Bob', aliases: 'Bobby' }],
    };
    const result = filterProfileEvidence(
      profile,
      {
        ...facts,
        characters: [{ name: 'Alice', aliases: 'Ally' }],
        glossary: [
          { source: 'Sword', target: 'Bobby' },
          { source: 'Ally', target: 'Người bạn' },
          { source: 'Alice', target: 'Alice' },
        ],
      },
      ['Sword Ally Alice 1', 'Sword Ally Alice 2', 'Sword Ally Alice 3', 'Sword alone 4'],
    );
    expect(result.characters).toEqual([]);
    expect(result.glossary).toEqual([]);
  });
  it('không tạo đề xuất mâu thuẫn khi thuật ngữ chưa đủ bằng chứng', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({
        ...DEFAULT_PROFILE,
        id: 'game',
        glossary: [{ source: 'Star Gate', target: 'Cũ' }],
      });
      db.applyProfileEnrichment('game', 0, facts);
      expect(db.profileProposals('game')).toEqual([]);
      expect(db.profiles().find((p) => p.id === 'game')?.glossary).toEqual([
        { source: 'Star Gate', target: 'Cũ' },
      ]);
    } finally {
      db.close();
    }
  });
  it('đếm từ DB qua các phiên, cả trước khi xóa hồ sơ và chỉ tính câu dịch thành công', () => {
    const db = openDatabase(':memory:');
    try {
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game', instructions: 'Giữ nguyên' });
      db.saveProfile({ ...DEFAULT_PROFILE, id: 'other', name: 'Other' });
      const a = db.createSession('game');
      const b = db.createSession('game');
      const other = db.createSession('other');
      const add = (
        id: string,
        sessionId: string,
        sequence: number,
        text: string,
        status: 'translated' | 'error' = 'translated',
      ) =>
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
      add('one', a.id, 1, 'Ally found Star Gate.');
      add('two', a.id, 2, 'Alice sees Star Gate.');
      add('three', b.id, 1, 'Ally opens Star Gate.');
      add('duplicate', b.id, 2, '  ALLY found   star gate. ');
      add('wrong-profile', other.id, 1, 'Ally closes Star Gate.');
      add('failed', b.id, 3, 'Alice closes Star Gate.', 'error');
      db.applyProfileEnrichment('game', 0, facts);
      expect(db.profiles().find((p) => p.id === 'game')?.characters).toEqual([]);
      expect(db.profiles().find((p) => p.id === 'game')?.glossary).toEqual([]);
      db.clearProfile('game', 1);
      add('four', b.id, 4, 'Alice closes Star Gate.');
      db.applyProfileEnrichment('game', 2, facts);
      const result = db.profiles().find((p) => p.id === 'game')!;
      expect(result.instructions).toBe('Giữ nguyên');
      expect(result.characters[0]).toMatchObject({ name: 'Alice', aliases: 'Ally' });
      expect(result.glossary).toEqual([{ source: 'Star Gate', target: 'Cổng Sao' }]);
      expect(result.relationships[0]).toMatchObject({ self: 'Tôi', address: 'em' });
    } finally {
      db.close();
    }
  });
});
