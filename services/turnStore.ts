import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Turn, TurnSequence } from '../types/dualProcess';

interface TurnStoreDB extends DBSchema {
    turns: {
        key: string;
        value: Turn;
    };
    sequences: {
        key: number;
        value: TurnSequence;
        indexes: { 'by-timestamp': number };
    };
}

class TurnStore {
    private db: IDBPDatabase<TurnStoreDB> | null = null;
    private currentSequence: Turn[] = [];

    async init(): Promise<void> {
        this.db = await openDB<TurnStoreDB>('reflex-turns-v1', 1, {
            upgrade(db) {
                // Store individual turns
                if (!db.objectStoreNames.contains('turns')) {
                    db.createObjectStore('turns', { keyPath: 'id' });
                }

                // Store turn sequences (history of what turns were active when)
                if (!db.objectStoreNames.contains('sequences')) {
                    const sequenceStore = db.createObjectStore('sequences', {
                        keyPath: 'timestamp',
                        autoIncrement: false
                    });
                    sequenceStore.createIndex('by-timestamp', 'timestamp');
                }
            },
        });
    }

    async addTurn(turn: Turn): Promise<void> {
        if (!this.db) await this.init();
        await this.db!.put('turns', turn);
    }

    async getTurn(id: string): Promise<Turn | undefined> {
        if (!this.db) await this.init();
        return this.db!.get('turns', id);
    }

    async recordSequence(turns: Turn[]): Promise<void> {
        if (!this.db) await this.init();

        const turnIds = turns.map(t => t.id).join(',');

        // Hash using browser's SubtleCrypto
        const encoder = new TextEncoder();
        const data = encoder.encode(turnIds);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const sequence: TurnSequence = {
            turns,
            timestamp: Date.now(),
            hash
        };

        await this.db!.put('sequences', sequence);
        this.currentSequence = turns;
    }

    async getSequenceHistory(limit: number = 10): Promise<TurnSequence[]> {
        if (!this.db) await this.init();

        const tx = this.db!.transaction('sequences', 'readonly');
        const index = tx.store.index('by-timestamp');

        const sequences: TurnSequence[] = [];
        let cursor = await index.openCursor(null, 'prev');

        while (cursor && sequences.length < limit) {
            sequences.push(cursor.value);
            cursor = await cursor.continue();
        }

        return sequences;
    }

    getCurrentSequence(): Turn[] {
        return this.currentSequence;
    }
}

export const turnStore = new TurnStore();
