import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as nicknameService from '../../src/services/nicknameService';
import * as profileRepository from '../../src/storage/profileRepository';
import * as profileCache from '../../src/storage/profileCache';

vi.mock('../../src/storage/profileRepository');
vi.mock('../../src/storage/profileCache');

describe('nicknameService consumer behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid nicknames', () => {
    expect(() => nicknameService.validateNickname('')).toThrow(
      'Nickname must be between 1 and 30 characters',
    );
    expect(() => nicknameService.validateNickname('$$$')).toThrow(
      'Nickname contains invalid characters',
    );
  });

  it('checks cache before database for nickname availability', async () => {
    vi.mocked(profileCache.getUserIdByNickname).mockResolvedValue('user-1');

    const available = await nicknameService.isAvailable('TakenName');

    expect(available).toBe(false);
    expect(profileRepository.findByNickname).not.toHaveBeenCalled();
  });

  it('generates nicknames that pass availability checks', async () => {
    vi.mocked(profileCache.getUserIdByNickname).mockResolvedValue(null);
    vi.mocked(profileRepository.findByNickname).mockResolvedValue(null);

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456);

    const nickname = await nicknameService.generateNickname('user-123');

    expect(nickname.startsWith('Playeruser')).toBe(true);
    randomSpy.mockRestore();
  });
});
