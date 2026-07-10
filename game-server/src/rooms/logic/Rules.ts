import { Card } from "../schema/GameState";
import { GameConfig } from "./GameConfig";

/* ── Constantes ─────────────────────────────────────────────── */

/** Ordre normal : 3 le plus faible, 2 le plus fort */
const NORMAL_ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

/** Ordre des couleurs pour le tri (Clubs < Diamonds < Hearts < Spades) */
const SUIT_ORDER = ["C", "D", "H", "S"];

/* ── Types de combinaison ───────────────────────────────────── */

export type CombinationType = "single" | "pair" | "triple" | "quad" | "invalid";

/* ── Classe Rules ───────────────────────────────────────────── */

export class Rules {
    /**
     * Retourne la valeur numérique d'un rang.
     */
    static getCardValue(rank: string, isRevolution: boolean = false): number {
        const val = NORMAL_ORDER.indexOf(rank);
        if (isRevolution) {
            // During revolution, 2 becomes the weakest card
            if (rank === "2") return -1;
            // Reverse 3-A: A(11) becomes 0, 3(0) becomes 11
            return 11 - val;
        }
        return val;
    }

    /**
     * Retourne la valeur numérique d'une couleur (pour le tri).
     */
    static getSuitValue(suit: string): number {
        return SUIT_ORDER.indexOf(suit);
    }

    /**
     * Détermine le type de combinaison d'un ensemble de cartes.
     */
    static getCombinationType(cards: Card[], config: GameConfig): CombinationType {
        if (cards.length === 0) return "invalid";
        if (cards.length === 1) return "single";

        const firstRank = cards[0].rank;
        const allSameRank = cards.every(c => c.rank === firstRank);

        if (allSameRank) {
            switch (cards.length) {
                case 2: return "pair";
                case 3: return "triple";
                case 4: return "quad";
                default: return "invalid";
            }
        }

        return "invalid";
    }

    /**
     * Vérifie si un coup est valide par rapport au pli courant.
     */
    static isValidMove(
        playedCards: Card[],
        currentTrick: Card[],
        config: GameConfig,
        isForcedRank: string = "",
        activeConsecutiveCards: number = 0,
        isRevolution: boolean = false
    ): boolean {
        if (playedCards.length === 0) return false;

        const playedType = this.getCombinationType(playedCards, config);
        if (playedType === "invalid") return false;

        // ── 2 spécial : coupe le pli (sauf en révolution) ──
        if (!isRevolution && playedCards.every(c => c.rank === "2")) {
            // Un ou plusieurs 2 peuvent couper, mais ils doivent respecter le nombre de cartes du pli (sauf si vide)
            if (currentTrick.length > 0 && playedCards.length !== currentTrick.length) {
                return false;
            }
            return true;
        }

        // ── Pli vide → n'importe quelle combinaison valide ──
        if (currentTrick.length === 0) {
            return true;
        }

        const trickType = this.getCombinationType(currentTrick, config);

        // ── Complétion de carré (prioritaire) ──
        // À tout moment, si un joueur pose N cartes du même rang que le pli
        // et que le total atteint exactement 4, c'est un carré valide.
        // Ex: 1 Valet déjà joué → le joueur suivant pose 3 Valets = carré.
        if (
            playedCards.every(c => c.rank === currentTrick[0].rank) &&
            activeConsecutiveCards + playedCards.length === 4
        ) {
            return true;
        }

        // ── Règle du joueur forcé ("ou rien") ──
        if (isForcedRank) {
            // Toutes les cartes jouées doivent être du rang forcé
            if (!playedCards.every(c => c.rank === isForcedRank)) {
                return false;
            }
            // Le nombre total ne doit pas dépasser 4 (carré)
            const newTotal = activeConsecutiveCards + playedCards.length;
            if (newTotal > 4) return false;
            return true;
        }

        if (playedType !== trickType) return false;

        // ── Même nombre de cartes ──
        if (playedCards.length !== currentTrick.length) return false;

        // ── Valeur supérieure ou égale requise ──
        // Pour single / pair / triple / quad : comparer le rang
        const playedValue = this.getCardValue(playedCards[0].rank, isRevolution);
        const trickValue = this.getCardValue(currentTrick[0].rank, isRevolution);
        return playedValue >= trickValue;
    }

    /**
     * Trie une main par valeur croissante, puis par couleur.
     */
    static sortHand(
        hand: { suit: string; rank: string }[],
        isRevolution: boolean = false
    ): { suit: string; rank: string }[] {
        return hand.sort((a, b) => {
            const valA = this.getCardValue(a.rank, isRevolution);
            const valB = this.getCardValue(b.rank, isRevolution);
            if (valA !== valB) return valA - valB;
            return this.getSuitValue(a.suit) - this.getSuitValue(b.suit);
        });
    }

    /**
     * Trouve le joueur qui doit commencer la manche.
     * - "three_of_clubs" : celui qui a le 3♣
     * - "lowest_card" : celui qui a la plus petite carte
     */
    static findStartingPlayer(
        hands: Map<string, { suit: string; rank: string }[]>,
        config: GameConfig
    ): string {
        const playerIds = Array.from(hands.keys());

        if (config.startRule === "three_of_clubs") {
            for (const id of playerIds) {
                const hand = hands.get(id)!;
                if (hand.some(c => c.rank === "3" && c.suit === "C")) {
                    return id;
                }
            }
        }

        // Fallback ou "lowest_card" : trouver la plus petite carte
        let lowestPlayerId = playerIds[0];
        let lowestValue = Infinity;

        for (const id of playerIds) {
            const hand = hands.get(id)!;
            for (const card of hand) {
                const val = this.getCardValue(card.rank);
                const suitVal = this.getSuitValue(card.suit);
                const compositeVal = val * 10 + suitVal;
                if (compositeVal < lowestValue) {
                    lowestValue = compositeVal;
                    lowestPlayerId = id;
                }
            }
        }

        return lowestPlayerId;
    }

    /**
     * Effectue l'échange de cartes entre deux joueurs.
     * @param giverHand  Main du donneur (modifiée en place)
     * @param receiverHand  Main du receveur (modifiée en place)
     * @param count  Nombre de cartes à échanger
     * @param giveBest  true = donner les meilleures, false = donner les pires
     */
    static exchangeCards(
        giverHand: { suit: string; rank: string }[],
        receiverHand: { suit: string; rank: string }[],
        count: number,
        giveBest: boolean,
        isRevolution: boolean = false
    ): void {
        // Trier la main du donneur
        this.sortHand(giverHand, isRevolution);

        // Extraire les cartes à donner
        const cardsToGive: { suit: string; rank: string }[] = [];
        for (let i = 0; i < count && giverHand.length > 0; i++) {
            const idx = giveBest ? giverHand.length - 1 : 0;
            cardsToGive.push(giverHand.splice(idx, 1)[0]);
        }

        // Ajouter les cartes au receveur
        receiverHand.push(...cardsToGive);
    }
}
