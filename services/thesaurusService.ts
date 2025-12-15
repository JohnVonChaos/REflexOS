// services/thesaurusService.ts
import { get, set } from 'idb-keyval';
import type { Vocab } from './vocabService';

const DB_KEY_THESAURUS = 'srg-thesaurus-v1';

interface ThesaurusState {
    synonymGroups: number[][];
    wordToGroupIds: [number, number[]][];
}

export class Thesaurus {
    public synonymGroups: number[][] = [];
    private wordToGroupIds: Map<number, Set<number>> = new Map();

    public isReady: Promise<void>;
    private resolveReady: () => void = () => {};

    constructor() {
        this.isReady = new Promise(resolve => {
            this.resolveReady = resolve;
        });
    }

    async init(vocab: Vocab, synonymGroups: string[][]) {
        const storedState = await get<ThesaurusState>(DB_KEY_THESAURUS);
        if (storedState) {
            this.synonymGroups = storedState.synonymGroups;
            this.wordToGroupIds = new Map(storedState.wordToGroupIds.map(([key, value]) => [key, new Set(value)]));
            console.log(`Thesaurus loaded from cache with ${this.synonymGroups.length} groups.`);
        } else {
            console.log('No cached thesaurus found. Building from dataset...');
            for (const group of synonymGroups) {
                const groupAddresses = group
                    .map(word => vocab.encode(word.toLowerCase()))
                    .filter((addr): addr is number => addr !== undefined);
                
                if (groupAddresses.length > 1) {
                    this.addSynonymGroup(groupAddresses);
                }
            }
            await this.save();
            console.log(`Thesaurus built and saved with ${this.synonymGroups.length} groups.`);
        }
        this.resolveReady();
    }

    private async save() {
        const serializableMap: [number, number[]][] = Array.from(this.wordToGroupIds.entries())
            .map(([key, valueSet]) => [key, Array.from(valueSet)]);
        
        const state: ThesaurusState = {
            synonymGroups: this.synonymGroups,
            wordToGroupIds: serializableMap,
        };
        await set(DB_KEY_THESAURUS, state);
    }
    
    private addSynonymGroup(groupAddresses: number[]) {
        if (groupAddresses.length < 2) return;
        const groupId = this.synonymGroups.length;
        this.synonymGroups.push(groupAddresses);

        for (const addr of groupAddresses) {
            if (!this.wordToGroupIds.has(addr)) {
                this.wordToGroupIds.set(addr, new Set());
            }
            this.wordToGroupIds.get(addr)!.add(groupId);
        }
    }

    getSynonymCloud(wordAddr: number): number[] {
        const synonyms = new Set<number>();
        const groupIds = this.wordToGroupIds.get(wordAddr);
        if (groupIds) {
            for (const groupId of groupIds) {
                const group = this.synonymGroups[groupId];
                if (group) {
                    for (const addr of group) {
                        synonyms.add(addr);
                    }
                }
            }
        }
        return Array.from(synonyms);
    }
}

export const thesaurusService = new Thesaurus();
