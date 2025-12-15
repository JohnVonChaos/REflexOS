import { describe, it, expect } from 'vitest';
import { importEntries } from '../services/chatImportService';
import { memoryService } from '../services/memoryService';
import { ALL_CONTEXT_PACKETS, CONTEXT_PACKET_LABELS } from '../types';

describe('chatImportService', () => {
  it('imports entries into memory and forwards to SRG via memoryService', async () => {
    const before = await memoryService.getAll();
    const now = Date.now();
    const entries = [
      { source: 'chatgpt', conversationId: 'conv-1', role: 'user', timestamp: now - 1000, text: 'Hello' },
      { source: 'chatgpt', conversationId: 'conv-1', role: 'assistant', timestamp: now, text: 'Hi there' },
    ];

    const created = await importEntries(entries as any);
    expect(created.length).toBe(2);

    const after = await memoryService.getAll();
    expect(after.length - before.length).toBe(2);

    const imported = after.slice(-2);
    expect(imported.some(a => a.type === 'user_message' && a.source === 'chatgpt' && a.conversationId === 'conv-1')).toBe(true);
    expect(imported.some(a => a.type === 'model_response' && a.source === 'chatgpt' && a.conversationId === 'conv-1')).toBe(true);
  });

  it('exposes IMPORTED_HISTORY in context packets', () => {
    expect(ALL_CONTEXT_PACKETS.includes('IMPORTED_HISTORY')).toBe(true);
    expect(CONTEXT_PACKET_LABELS['IMPORTED_HISTORY']).toBe("Imported Conversation History");
  });

  it('links user and assistant turns when reply relationships exist', async () => {
    const now = Date.now();
    const entries = [
      { source: 'chatgpt', conversationId: 'conv-2', role: 'user', timestamp: now - 2000, text: 'What is the capital of France?' },
      { source: 'chatgpt', conversationId: 'conv-2', role: 'assistant', timestamp: now - 1000, text: 'Paris is the capital of France.' },
    ];

    const created = await importEntries(entries as any);
    expect(created.length).toBe(2);
    const user = created.find(c => c.type === 'user_message');
    const assistant = created.find(c => c.type === 'model_response');
    expect(user).toBeDefined();
    expect(assistant).toBeDefined();
    expect(user!.turnId).toBeDefined();
    expect(assistant!.replyToTurnId).toBe(user!.turnId);
    // Cross-links should have been created
    const fetchedUser = (await memoryService.getByUuid(user!.uuid))!;
    const fetchedAssistant = (await memoryService.getByUuid(assistant!.uuid))!;
    expect(fetchedUser.traceIds).toContain(fetchedAssistant.turnId);
    expect(fetchedAssistant.traceIds).toContain(fetchedUser.turnId);
  });
});
