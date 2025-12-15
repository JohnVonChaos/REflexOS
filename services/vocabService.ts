// services/vocabService.ts
import { get, set } from 'idb-keyval';

const DB_KEY_VOCAB = 'srg-vocab-v1';
const MAX_3BYTE_ADDR = 1 << 24;

interface VocabState {
    wordToAddr: [string, number][];
    addrToWord: [number, string][];
    occupiedAddresses: number[];
}

// Ported from src/vocab.rs
function shiftedGematriaVal(c: char): bigint {
    const lower_c = c.toLowerCase();
    if (lower_c >= 'a' && lower_c <= 'z') {
        return BigInt(lower_c.charCodeAt(0) - 'a'.charCodeAt(0) + 2);
    }
    switch (c) {
        case '.': return 28n;
        case ',': return 29n;
        case '!': return 30n;
        case '?': return 31n;
        case "'": return 32n;
        default: return 1n;
    }
}

const fibCache = new Map<number, number>();
function fibonacci(n: number): number {
    if (n <= 1) return n;
    if (fibCache.has(n)) return fibCache.get(n)!;
    const res = fibonacci(n - 1) + fibonacci(n - 2);
    fibCache.set(n, res);
    return res;
}

export class Vocab {
    public wordToAddr: Map<string, number> = new Map();
    public addrToWord: Map<number, string> = new Map();
    private occupiedAddresses: Set<number> = new Set();
    
    public isReady: Promise<void>;
    private resolveReady: () => void = () => {};

    constructor() {
        this.isReady = new Promise(resolve => {
            this.resolveReady = resolve;
        });
    }

    async init(words: string[], onProgress: (message: string) => void) {
        const storedState = await get<VocabState>(DB_KEY_VOCAB);
        if (storedState) {
            this.wordToAddr = new Map(storedState.wordToAddr);
            this.addrToWord = new Map(storedState.addrToWord);
            this.occupiedAddresses = new Set(storedState.occupiedAddresses);
            console.log(`Vocab loaded from cache with ${this.wordToAddr.size} words.`);
            onProgress(`Loaded ${this.wordToAddr.size} words from cache.`);
        } else {
            console.log(`No cached vocab found. Building from ${words.length} words...`);
            onProgress(`Building from ${words.length} words...`);
            for (let i = 0; i < words.length; i++) {
                this.encodeWordGdaInternal(words[i]);
                if ((i+1) % 1000 === 0) {
                    onProgress(`Processed ${i+1} / ${words.length} words...`);
                }
            }
            onProgress('Saving to cache...');
            await this.save();
            console.log(`Vocab built and saved with ${this.wordToAddr.size} words.`);
        }
        this.resolveReady();
    }

    private async save() {
        const state: VocabState = {
            wordToAddr: Array.from(this.wordToAddr.entries()),
            addrToWord: Array.from(this.addrToWord.entries()),
            occupiedAddresses: Array.from(this.occupiedAddresses),
        };
        await set(DB_KEY_VOCAB, state);
    }

    encode(word: string): number | undefined {
        return this.wordToAddr.get(word.toLowerCase());
    }
    
    decode(addr: number): string | undefined {
        return this.addrToWord.get(addr);
    }

    private encodeWordGdaInternal(word: string): number {
        if (!word) throw new Error("Cannot encode an empty word");

        const wordLower = word.toLowerCase();
        if (this.wordToAddr.has(wordLower)) {
            return this.wordToAddr.get(wordLower)!;
        }

        let signatureN = 0n;
        const basePower = 31n;
        for (let i = 0; i < wordLower.length; i++) {
            const charVal = shiftedGematriaVal(wordLower[i] as char);
            const exponent = BigInt(wordLower.length - 1 - i);
            const term = charVal * (basePower ** exponent);
            signatureN += term;
        }

        let currentAddress = Number(signatureN % BigInt(MAX_3BYTE_ADDR));

        const signatureN_u32 = Number(signatureN % BigInt(2**32));
        const fibIndex = (wordLower.length + (signatureN_u32 % 90)) % 90;
        const fibValue = fibonacci(fibIndex);

        const MOD_VALUE_FOR_ROTATION = (1 << 23) - 1;
        let rotationStep = (fibValue + signatureN_u32) % MOD_VALUE_FOR_ROTATION;
        rotationStep = (rotationStep * 2 + 1) % MAX_3BYTE_ADDR;
        if (rotationStep === 0) rotationStep = 1;

        let probes = 0;
        const MAX_PROBES = 10000;

        while (this.occupiedAddresses.has(currentAddress)) {
            currentAddress = (currentAddress + rotationStep) % MAX_3BYTE_ADDR;
            probes++;
            if (probes > MAX_PROBES) {
                throw new Error(`GDA failed for word "${word}" after ${MAX_PROBES} probes.`);
            }
        }
        
        this.wordToAddr.set(wordLower, currentAddress);
        this.addrToWord.set(currentAddress, wordLower); // Store lowercase version for consistency
        this.occupiedAddresses.add(currentAddress);

        return currentAddress;
    }
}

type char = string & { length: 1 };
export const vocabService = new Vocab();
