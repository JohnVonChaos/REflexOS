import type { ChatImportEntry } from '../../services/chatImportService';
import { importEntries as importEntriesImpl } from '../../services/chatImportService';

/**
 * Parse import file content into a normalized structure used by the UI/tests.
 * Supports: ChatGPT export (array with mapping), reflex session JSON ({ messages: [...] }),
 * and plain text (split by blank lines into user messages).
 */
export async function parseImportFile(text: string, filename: string) {
	// Try JSON first
	try {
		const parsed = JSON.parse(text);
		// ChatGPT export format: array with items containing mapping
		if (Array.isArray(parsed)) {
			const entries: any[] = [];
			for (const conv of parsed) {
				if (conv && conv.mapping) {
					for (const key of Object.keys(conv.mapping)) {
						const msg = conv.mapping[key].message;
						const role = msg.author?.role || 'user';
						const ts = typeof msg.create_time === 'number' ? msg.create_time * 1000 : undefined;
						const parts = msg.content?.parts || [];
						entries.push({ source: 'chatgpt', conversationId: conv.id, role, timestamp: ts, text: parts[0] || '', raw: msg });
					}
				}
			}
			return { entries };
		}

		// Reflex session state with messages array
		if (parsed && Array.isArray(parsed.messages)) {
			const entries = parsed.messages.map((m: any) => ({ source: 'reflex-session', role: m.role, timestamp: m.timestamp, text: m.text, raw: m }));
			return { sessionState: parsed, entries };
		}
	} catch (e) {
		// Not JSON - fall through to plain text handling
	}

	// Plain text: split on double newlines into paragraphs
	const parts = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
	const entries = parts.map(p => ({ source: filename, role: 'user', text: p }));
	return { entries };
}

export const importEntries = importEntriesImpl;
