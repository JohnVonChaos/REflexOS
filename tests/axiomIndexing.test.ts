import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { srgService } from '../src/services/srgService';
import { indexAxiomsToSRG } from '../src/services/axiomIndexing';

describe('indexAxiomsToSRG', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls SRG methods for each axiom', async () => {
    const reinforceSpy = vi.spyOn(srgService, 'reinforceLinksFromText').mockResolvedValue(undefined);
    const ingestSpy = vi.spyOn(srgService, 'ingestHybrid').mockResolvedValue(undefined as any);

    const atoms = [
      { uuid: '1', text: 'Test axiom one', axiomId: 'test.one' } as any,
      { uuid: '2', text: 'Another axiom', axiomId: 'test.two' } as any,
    ];

    await indexAxiomsToSRG(atoms);

    expect(reinforceSpy).toHaveBeenCalledTimes(2);
    expect(reinforceSpy).toHaveBeenCalledWith('Test axiom one');
    expect(reinforceSpy).toHaveBeenCalledWith('Another axiom');

    expect(ingestSpy).toHaveBeenCalledTimes(2);
    expect(ingestSpy).toHaveBeenCalledWith('Test axiom one', expect.any(Object));
  });

  it('is a no-op for empty list', async () => {
    const reinforceSpy = vi.spyOn(srgService, 'reinforceLinksFromText').mockResolvedValue(undefined);
    const ingestSpy = vi.spyOn(srgService, 'ingestHybrid').mockResolvedValue(undefined as any);

    await indexAxiomsToSRG([]);

    expect(reinforceSpy).not.toHaveBeenCalled();
    expect(ingestSpy).not.toHaveBeenCalled();
  });
});
