import { createHash, randomUUID } from 'node:crypto';
import { profileSchema } from '../../shared/types';
import type { GameProfile, ProfileEnrichment, ProfileProposal } from '../../shared/types';

const ALIAS_SEPARATOR = /[,;\n/|]/;
const ADDRESS_SEPARATOR = /\s*(?:\/|\||;|,|\n|\b(?:hoặc|or)\b)\s*/iu;
const MIN_EVIDENCE_SENTENCES = 4;

/** Khóa so tên không phụ thuộc hoa thường hoặc khoảng trắng OCR. */
function normalized(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
/** Tách các biệt danh do người dùng hoặc AI nhập bằng dấu phân cách thường dùng. */
function names(character: { name: string; aliases: string }): string[] {
  return [character.name, ...character.aliases.split(ALIAS_SEPARATOR)]
    .map(normalized)
    .filter(Boolean);
}
/** Lọc dữ kiện AI theo các câu gốc đã dịch, không thay dữ liệu người dùng đã lưu. */
export function filterProfileEvidence(
  profile: GameProfile,
  facts: ProfileEnrichment,
  dialogues: string[],
): ProfileEnrichment {
  const sentences = [...new Set(dialogues.map(normalized).filter(Boolean))];
  /** Tạo mẫu khớp cụm từ nguyên vẹn theo ranh giới chữ và số Unicode. */
  function termPattern(term: string): RegExp {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}\\p{M}_])${escaped}(?=$|[^\\p{L}\\p{N}\\p{M}_])`, 'u');
  }
  /** Mỗi câu khác nhau đóng góp tối đa một lượt, kể cả khi chứa nhiều biệt danh. */
  function supported(terms: string[]): boolean {
    const valid = [...new Set(terms.map(normalized).filter(Boolean))];
    const patterns = valid.map(termPattern);
    let count = 0;
    for (const sentence of sentences)
      if (patterns.some((pattern) => pattern.test(sentence)) && ++count >= MIN_EVIDENCE_SENTENCES)
        return true;
    return false;
  }
  const characterNames = new Set([...profile.characters, ...facts.characters].flatMap(names));
  return {
    ...facts,
    characters: facts.characters
      .filter((character) => supported(names(character)))
      .map((character) => ({
        ...character,
        aliases: character.aliases
          .split(ALIAS_SEPARATOR)
          .map((alias) => alias.trim())
          .filter((alias) => alias && normalized(alias) !== normalized(character.name))
          .join(', '),
      })),
    relationships: facts.relationships
      .map((row) => ({
        ...row,
        self: row.self.split(ADDRESS_SEPARATOR)[0].trim(),
        address: row.address.split(ADDRESS_SEPARATOR)[0].trim(),
      }))
      .filter((row) => row.self && row.address),
    glossary: facts.glossary.filter(
      (row) =>
        !characterNames.has(normalized(row.source)) &&
        !characterNames.has(normalized(row.target)) &&
        supported([row.source]),
    ),
  };
}
/** Khóa nghiệp vụ ổn định cho từng mục của hồ sơ. */
function itemKey(field: ProfileProposal['field'], item: unknown): string {
  if (field === 'characters') return profileSchema.shape.characters.element.parse(item).id;
  if (field === 'relationships') {
    const row = profileSchema.shape.relationships.element.parse(item);
    return JSON.stringify([normalized(row.speaker), normalized(row.listener)]);
  }
  if (field === 'glossary')
    return normalized(profileSchema.shape.glossary.element.parse(item).source);
  return '';
}

/** Ghép nhân vật/quan hệ/thuật ngữ; luôn giữ nguyên quy tắc dịch ưu tiên do người dùng sở hữu. */
export function mergeProfile(
  profile: GameProfile,
  facts: ProfileEnrichment,
): { profile: GameProfile; proposals: ProfileProposal[] } {
  const result = structuredClone(profile);
  const proposals: ProfileProposal[] = [];
  /** ID theo nội dung giúp đề xuất đã bỏ không xuất hiện lại. */
  function propose(
    field: Exclude<ProfileProposal['field'], 'instructions'>,
    key: string,
    before: unknown,
    after: unknown,
  ): void {
    const data = {
      profileId: profile.id,
      field,
      key,
      before: JSON.stringify(before),
      after: JSON.stringify(after),
    };
    proposals.push({
      ...data,
      id: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
      evidence: facts.evidence,
      status: 'pending',
    });
  }
  for (const character of facts.characters) {
    const incomingNames = names(character);
    const matches = result.characters.filter((row) =>
      names(row).some((name) => incomingNames.includes(name)),
    );
    if (!matches.length) result.characters.push({ id: randomUUID(), ...character });
    else if (matches.length > 1)
      propose('characters', '', result.characters, [
        ...result.characters,
        { id: createHash('sha256').update(JSON.stringify(character)).digest('hex'), ...character },
      ]);
    else {
      const old = matches[0];
      const extras = [character.name, ...character.aliases.split(ALIAS_SEPARATOR)]
        .map((name) => name.trim())
        .filter((name) => name && !names(old).includes(normalized(name)));
      if (!old.aliases.trim() && extras.length) old.aliases = extras.join(', ');
      else if (extras.length)
        propose('characters', old.id, old, {
          ...old,
          aliases: [old.aliases, ...extras].join(', '),
        });
    }
  }
  for (const row of facts.relationships) {
    // Chuẩn hóa tên theo biệt danh duy nhất trước khi so cặp quan hệ có hướng.
    /** Chuẩn hóa khi chỉ có một nhân vật khớp, tránh tự chọn giữa các biệt danh trùng. */
    function canonical(name: string): string {
      const matches = result.characters.filter((character) =>
        names(character).includes(normalized(name)),
      );
      return matches.length === 1 ? matches[0].name : name;
    }
    const incoming = { ...row, speaker: canonical(row.speaker), listener: canonical(row.listener) };
    if (
      [row.speaker, row.listener].some(
        (name) =>
          result.characters.filter((character) => names(character).includes(normalized(name)))
            .length > 1,
      )
    ) {
      propose('relationships', '', result.relationships, [...result.relationships, incoming]);
      continue;
    }
    const key = itemKey('relationships', incoming);
    const old = result.relationships.find(
      (item) =>
        itemKey('relationships', {
          ...item,
          speaker: canonical(item.speaker),
          listener: canonical(item.listener),
        }) === key,
    );
    if (!old) result.relationships.push(incoming);
    else if (
      normalized(old.self) !== normalized(incoming.self) ||
      normalized(old.address) !== normalized(incoming.address)
    )
      propose('relationships', itemKey('relationships', old), old, incoming);
  }
  for (const row of facts.glossary) {
    const key = normalized(row.source);
    const old = result.glossary.find((item) => normalized(item.source) === key);
    if (!old) result.glossary.push(row);
    else if (normalized(old.target) !== normalized(row.target)) propose('glossary', key, old, row);
  }
  return { profile: profileSchema.parse(result), proposals };
}

/** Áp dụng đề xuất khi giá trị đang lưu vẫn đúng với bản gốc đã hiển thị cho người duyệt. */
export function acceptProfileProposal(
  profile: GameProfile,
  proposal: ProfileProposal,
): GameProfile {
  const result = structuredClone(profile);
  const { field } = proposal;
  // Chặn cả đề xuất quy tắc AI được lưu từ phiên bản cũ.
  if (field === 'instructions') throw new Error('INVALID_INPUT');
  if (!proposal.key) {
    if (JSON.stringify(result[field]) !== proposal.before) throw new Error('PROFILE_CHANGED');
    return profileSchema.parse({ ...result, [field]: JSON.parse(proposal.after) as unknown });
  } else {
    const rows = result[field];
    const index = rows.findIndex((row) => itemKey(field, row) === proposal.key);
    if (index < 0 || JSON.stringify(rows[index]) !== proposal.before)
      throw new Error('PROFILE_CHANGED');
    const changed = [...rows];
    changed[index] = JSON.parse(proposal.after) as (typeof rows)[number];
    const validated = profileSchema.parse({ ...result, [field]: changed });
    return validated;
  }
}
