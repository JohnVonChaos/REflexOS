import { describe, it, expect } from 'vitest';
import { parseImportFile } from '../services/chatImportService';

describe('parseImportFile', () => {
  it('parses ChatGPT export format', async () => {
    const sample = [
      {
        id: 'conv-1',
        mapping: {
          '1': { message: { author: { role: 'user' }, create_time: 1690000000, content: { parts: ['Hello'] } } },
          '2': { message: { author: { role: 'assistant' }, create_time: 1690000001, content: { parts: ['Hi there'] } } }
        }
      }
    ];

    const parsed = await parseImportFile(JSON.stringify(sample), 'chatgpt.json');
    expect(parsed.entries).toBeDefined();
    expect(parsed.entries!.length).toBe(2);
    expect(parsed.entries![0].text).toBe('Hello');
    expect(parsed.entries![1].role).toBe('assistant');
  });

  it('parses reflex session state with messages array', async () => {
    const session = { messages: [{ role: 'user', text: 'A', timestamp: 1000 }, { role: 'assistant', text: 'B', timestamp: 2000 }] };
    const parsed = await parseImportFile(JSON.stringify(session), 'session.json');
    expect(parsed.sessionState).toBeDefined();
    expect(parsed.entries).toBeDefined();
    expect(parsed.entries!.length).toBe(2);
    expect(parsed.entries![0].source).toBe('reflex-session');
  });

  it('parses plain text into user messages', async () => {
    const txt = 'Line one\n\nLine two\n';
    const parsed = await parseImportFile(txt, 'notes.txt');
    expect(parsed.entries).toBeDefined();
    expect(parsed.entries!.length).toBe(2);
    expect(parsed.entries![0].text).toBe('Line one');
    expect(parsed.entries![0].source).toBe('notes.txt');
  });
});
