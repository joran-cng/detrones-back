import { describe, it, expect } from 'vitest';
import { Rules } from '../rooms/logic/Rules';
import { Card } from '../rooms/schema/GameState';
import { GameConfig } from '../rooms/GameConfig';

describe('Rules', () => {
    const config: GameConfig = {
        minPlayers: 3,
        maxPlayers: 7,
        enableRevolution: true,
        revolutionResetsTrick: false,
        startRule: 'three_of_clubs',
        exchangeCards: true,
        turnTimeoutMs: 25000,
        abandonBehavior: 'bot'
    };

    it('should correctly evaluate card values', () => {
        expect(Rules.getCardValue('3')).toBe(0);
        expect(Rules.getCardValue('2')).toBe(12);
    });

    it('should correctly evaluate card values during revolution', () => {
        expect(Rules.getCardValue('3', true)).toBe(11);
        expect(Rules.getCardValue('2', true)).toBe(-1);
    });

    it('should determine combination types', () => {
        const single = [new Card().assign({ suit: 'S', rank: '5' })];
        const pair = [
            new Card().assign({ suit: 'S', rank: '5' }),
            new Card().assign({ suit: 'H', rank: '5' })
        ];
        const invalid = [
            new Card().assign({ suit: 'S', rank: '5' }),
            new Card().assign({ suit: 'H', rank: '6' })
        ];

        expect(Rules.getCombinationType(single, config)).toBe('single');
        expect(Rules.getCombinationType(pair, config)).toBe('pair');
        expect(Rules.getCombinationType(invalid, config)).toBe('invalid');
    });

    it('should validate moves', () => {
        const trick = [new Card().assign({ suit: 'S', rank: '5' })];
        const higher = [new Card().assign({ suit: 'S', rank: '6' })];
        const lower = [new Card().assign({ suit: 'S', rank: '4' })];
        const pair = [
            new Card().assign({ suit: 'S', rank: '6' }),
            new Card().assign({ suit: 'H', rank: '6' })
        ];
        const two = [new Card().assign({ suit: 'S', rank: '2' })];

        expect(Rules.isValidMove(higher, trick, config)).toBe(true);
        expect(Rules.isValidMove(lower, trick, config)).toBe(false);
        expect(Rules.isValidMove(pair, trick, config)).toBe(false); // wrong quantity
        expect(Rules.isValidMove(two, trick, config)).toBe(true); // 2 cuts
    });

    it('should not allow 2 to cut during revolution', () => {
        const trick = [new Card().assign({ suit: 'S', rank: '5' })];
        const two = [new Card().assign({ suit: 'S', rank: '2' })];
        // 2 has value -1 in revolution
        expect(Rules.isValidMove(two, trick, config, "", 0, true)).toBe(false);
    });

    it('should sort hand', () => {
        const hand = [
            { suit: 'S', rank: '2' },
            { suit: 'S', rank: '3' },
            { suit: 'S', rank: '4' }
        ];
        const sorted = Rules.sortHand(hand);
        expect(sorted[0].rank).toBe('3');
        expect(sorted[2].rank).toBe('2');
    });
});
