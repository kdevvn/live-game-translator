import { describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { DEFAULT_PROFILE, DEFAULT_REGION } from '../shared/defaults';
import { SessionController } from './features/session';
import { OpenRouter } from './features/openRouter';

describe('Chọn hồ sơ', () => {
  it('không tạo hồ sơ mặc định và yêu cầu chọn hồ sơ trước khi bắt đầu', () => {
    const db = openDatabase(':memory:');
    const app = new SessionController(db, new OpenRouter(() => ''), () => {});
    expect(db.profiles()).toEqual([]);
    expect(() => app.begin()).toThrow('INVALID_INPUT');
    db.close();
  });
  it('bỏ hồ sơ mặc định cũ chưa sử dụng và giữ hồ sơ có lịch sử', () => {
    const db = openDatabase(':memory:');
    db.saveProfile(DEFAULT_PROFILE);
    db.migrate();
    expect(db.profiles()).toEqual([]);
    db.saveProfile(DEFAULT_PROFILE);
    db.createSession(DEFAULT_PROFILE.id);
    db.migrate();
    expect(db.profiles()).toEqual([DEFAULT_PROFILE]);
    db.close();
  });
  it('lưu vùng dịch riêng theo hồ sơ và khôi phục khi mở lại', () => {
    const db = openDatabase(':memory:');
    db.saveProfile({ ...DEFAULT_PROFILE, id: 'one', name: 'Một' });
    db.saveProfile({ ...DEFAULT_PROFILE, id: 'two', name: 'Hai' });
    const app = new SessionController(db, new OpenRouter(() => ''), () => {});
    const first = { x: 0.1, y: 0.2, width: 0.7, height: 0.3 };
    const second = { x: 0, y: 0.5, width: 1, height: 0.5 };
    app.openSession('one');
    app.setProfileRegion('one', first);
    app.openSession('two');
    expect(app.snapshot().region).toEqual(DEFAULT_REGION);
    app.setProfileRegion('two', second);
    app.openSession('one');
    expect(app.snapshot().region).toEqual(first);
    expect(new SessionController(db, new OpenRouter(() => ''), () => {}).snapshot().region).toEqual(
      first,
    );
    app.setProfileRegion('two', second);
    expect(app.snapshot().region).toEqual(first);
    db.deleteProfile('two');
    db.saveProfile({ ...DEFAULT_PROFILE, id: 'two', name: 'Hai' });
    app.openSession('two');
    expect(app.snapshot().region).toEqual(DEFAULT_REGION);
    db.close();
  });
  it('khôi phục phiên và hồ sơ đã chọn khi mở lại', () => {
    const db = openDatabase(':memory:');
    db.saveProfile({ ...DEFAULT_PROFILE, id: 'game', name: 'Game' });
    const app = new SessionController(db, new OpenRouter(() => ''), () => {});
    app.openSession('game');
    const session = app.snapshot().session;
    const reopened = new SessionController(db, new OpenRouter(() => ''), () => {});
    expect(reopened.snapshot().session).toEqual(session);
    db.close();
  });
});
