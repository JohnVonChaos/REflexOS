import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { ScratchpadEntry } from '../types/dualProcess';

interface ScratchpadDB extends DBSchema {
    entries: {
        key: string;
        value: ScratchpadEntry;
        indexes: { 'by-timestamp': number };
    };
}

class ScratchpadService {
    private db: IDBPDatabase<ScratchpadDB> | null = null;

    async init(): Promise<void> {
        this.db = await openDB<ScratchpadDB>('reflex-scratchpad-v1', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('entries')) {
                    const entryStore = db.createObjectStore('entries', { keyPath: 'id' });
                    entryStore.createIndex('by-timestamp', 'timestamp');
                }
            },
        });
    }

    async append(
        role: 'GENERATOR' | 'REFINER' | 'SYSTEM',
        content: string,
        actionType: ScratchpadEntry['actionType'] = 'OBSERVE',
        tension: ScratchpadEntry['tension'] = 'BALANCED'
    ): Promise<ScratchpadEntry> {
        if (!this.db) await this.init();

        const entry: ScratchpadEntry = {
            id: window.crypto.randomUUID(),
            role,
            content,
            timestamp: Date.now(),
            tension,
            actionType
        };

        await this.db!.put('entries', entry);
        return entry;
    }

    async getFullHistory(limit?: number): Promise<ScratchpadEntry[]> {
        if (!this.db) await this.init();

        const tx = this.db!.transaction('entries', 'readonly');
        const index = tx.store.index('by-timestamp');

        const entries: ScratchpadEntry[] = [];
        let cursor = await index.openCursor(null, 'next');

        while (cursor && (!limit || entries.length < limit)) {
            entries.push(cursor.value);
            cursor = await cursor.continue();
        }

        return entries;
    }

    async getRecentEntries(count: number = 10): Promise<ScratchpadEntry[]> {
        if (!this.db) await this.init();

        const tx = this.db!.transaction('entries', 'readonly');
        const index = tx.store.index('by-timestamp');

        const entries: ScratchpadEntry[] = [];
        let cursor = await index.openCursor(null, 'prev');

        while (cursor && entries.length < count) {
            entries.push(cursor.value);
            cursor = await cursor.continue();
        }

        return entries.reverse();
    }

    async getTensionHistory(windowSize: number = 20): Promise<{ generator: number; refiner: number }> {
        const recent = await this.getRecentEntries(windowSize);

        const generatorWins = recent.filter(e =>
            e.role === 'GENERATOR' && (e.tension === 'LOW' || e.actionType !== 'OBSERVE')
        ).length;

        const refinerWins = recent.filter(e =>
            e.role === 'REFINER' && (e.tension === 'HIGH' || e.actionType !== 'OBSERVE')
        ).length;

        return {
            generator: generatorWins,
            refiner: refinerWins
        };
    }

    async exportToJSON(): Promise<string> {
        const entries = await this.getFullHistory();

        const exportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            entryCount: entries.length,
            entries
        };

        return JSON.stringify(exportData, null, 2);
    }

    async exportToFile(): Promise<void> {
        const json = await this.exportToJSON();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `scratchpad_${timestamp}.json`;

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    }

    async importFromJSON(json: string): Promise<number> {
        if (!this.db) await this.init();

        const data = JSON.parse(json);
        const entries: ScratchpadEntry[] = data.entries || [];

        for (const entry of entries) {
            await this.db!.put('entries', entry);
        }

        return entries.length;
    }

    async clear(): Promise<void> {
        if (!this.db) await this.init();
        await this.db!.clear('entries');
    }
}

export const scratchpadService = new ScratchpadService();
