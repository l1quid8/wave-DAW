import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MockBackend } from '../api/mock';
import { recentLabels } from './recent';

beforeAll(() => { vi.stubGlobal('window', {}); });

describe('File → Open recent', () => {
  it('names a project by its file; two with one name get their folders', () => {
    expect(recentLabels([
      { path: 'C:/a/Beat.synkopa', name: 'Beat', dir: 'C:/a', exists: true },
      { path: 'D:/b/beat.synkopa', name: 'beat', dir: 'D:\\music\\b', exists: true },
      { path: 'C:/a/Song.synkopa', name: 'Song', dir: 'C:/a', exists: false },
    ])).toEqual(['Beat · a', 'beat · b', 'Song']);
  });
  it('the mock keeps the list like the app: open and save move to the top, a missing file cannot open', async () => {
    const be = new MockBackend();
    const before = await be.recentProjects();
    const missing = before.find(r => !r.exists)!;
    await expect(be.projectOpen(missing.path)).rejects.toThrow(/not there/);
    const other = before.find(r => r.exists && r.name === 'Night drive')!;
    await be.projectOpen(other.path);
    let list = await be.recentProjects();
    expect(list[0].path).toBe(other.path);
    expect(list.filter(r => r.path === other.path)).toHaveLength(1);
    expect(list.length).toBe(before.length);
    await be.projectSave(true);
    list = await be.recentProjects();
    expect(list[0].name).toMatch(/^Projekt /);
    await be.recentForget(missing.path);
    expect((await be.recentProjects()).some(r => r.path === missing.path)).toBe(false);
    await be.recentForget();
    expect(await be.recentProjects()).toEqual([]);
  });
});
