import type { Turn, ContextDiffEvent } from '../types/dualProcess';
import { turnStore } from './turnStore';

class ContextDiffer {
    private previousTurnIds: string[] = [];

    /**
   * Hash content using browser's SubtleCrypto API
   */
    private async hashContent(content: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Convert messages to Turn objects
     */
    async messagesToTurns(messages: any[]): Promise<Turn[]> {
        const turns: Turn[] = [];

        for (const msg of messages) {
            const content = msg.text || '';
            const hash = await this.hashContent(content);

            turns.push({
                id: msg.uuid || window.crypto.randomUUID(),
                role: msg.role === 'user' ? 'user' : msg.role === 'model' ? 'model' : 'system',
                content,
                timestamp: msg.timestamp || Date.now(),
                hash
            });
        }

        return turns;
    }

    /**
     * Detect changes in turn sequence
     */
    async detectChanges(newTurns: Turn[]): Promise<ContextDiffEvent[]> {
        const events: ContextDiffEvent[] = [];
        const newTurnIds = newTurns.map(t => t.id);

        // First run - no previous sequence
        if (this.previousTurnIds.length === 0) {
            this.previousTurnIds = newTurnIds;
            await turnStore.recordSequence(newTurns);

            return [{
                type: 'CONTEXT_FIRST_SEEN',
                turnCount: newTurns.length
            }];
        }

        // Check for complete wipe
        if (newTurnIds.length === 0 && this.previousTurnIds.length > 0) {
            events.push({
                type: 'CONTEXT_WIPE',
                turnCount: this.previousTurnIds.length
            });

            this.previousTurnIds = [];
            await turnStore.recordSequence([]);
            return events;
        }

        // Detect additions
        for (let i = 0; i < newTurnIds.length; i++) {
            const turnId = newTurnIds[i];
            if (!this.previousTurnIds.includes(turnId)) {
                events.push({
                    type: 'TURN_ADDED',
                    turn: newTurns[i],
                    position: i
                });
            }
        }

        // Detect removals and restorations
        for (let i = 0; i < this.previousTurnIds.length; i++) {
            const turnId = this.previousTurnIds[i];

            if (!newTurnIds.includes(turnId)) {
                // Check if it was restored (was missing, now back)
                const turn = await turnStore.getTurn(turnId);
                const history = await turnStore.getSequenceHistory(5);

                // Look for this turn in recent history
                let wasRecentlyPresent = false;
                let gapMs = 0;

                for (const seq of history) {
                    const hadTurn = seq.turns.some(t => t.id === turnId);
                    if (hadTurn) {
                        wasRecentlyPresent = true;
                        gapMs = Date.now() - seq.timestamp;
                        break;
                    }
                }

                if (wasRecentlyPresent && turn) {
                    events.push({
                        type: 'TURN_RESTORED',
                        turn,
                        position: newTurnIds.indexOf(turnId),
                        gapMs
                    });
                } else {
                    events.push({
                        type: 'TURN_REMOVED',
                        turnId,
                        position: i
                    });
                }
            }
        }

        // Detect reordering
        const commonIds = newTurnIds.filter(id => this.previousTurnIds.includes(id));
        if (commonIds.length > 0) {
            const oldOrder = this.previousTurnIds.filter(id => commonIds.includes(id));
            const newOrder = newTurnIds.filter(id => commonIds.includes(id));

            if (JSON.stringify(oldOrder) !== JSON.stringify(newOrder)) {
                events.push({
                    type: 'SEQUENCE_REORDERED',
                    oldSequence: oldOrder,
                    newSequence: newOrder
                });
            }
        }

        // Update state
        this.previousTurnIds = newTurnIds;
        await turnStore.recordSequence(newTurns);

        return events;
    }

    /**
     * Process messages and return diff events
     */
    async processMessages(messages: any[]): Promise<ContextDiffEvent[]> {
        const turns = await this.messagesToTurns(messages);

        // Store all new turns
        for (const turn of turns) {
            await turnStore.addTurn(turn);
        }

        return this.detectChanges(turns);
    }
}

export const contextDiffer = new ContextDiffer();
