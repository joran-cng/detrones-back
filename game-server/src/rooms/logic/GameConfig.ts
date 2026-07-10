/**
 * Configuration centralisée pour une partie de Président.
 * Toutes les valeurs ont un défaut raisonnable ; le créateur de la room
 * peut les surcharger via les options de création.
 */
export interface GameConfig {
    /* ── Joueurs ─────────────────────────────────────────── */
    minPlayers: number;           // min 3
    maxPlayers: number;           // max 7

    /* ── Règles de base ──────────────────────────────────── */
    /** Séquences (suites) activées */


    /** Le 2 peut couper / brûler le pli */


    /** Un carré déclenche une révolution (inverse l'ordre) */
    enableRevolution: boolean;

    /** Un carré reset (brûle) également le pli en plus de la révolution */
    revolutionResetsTrick: boolean;

    /* ── Démarrage ───────────────────────────────────────── */
    /** "three_of_clubs" = celui qui a le 3♣ commence
     *  "lowest_card"    = celui qui a la plus petite carte commence */
    startRule: "three_of_clubs" | "lowest_card";

    /* ── Échanges ────────────────────────────────────────── */
    /** Échanges de cartes en début de manche (Président↔TDC, VP↔VTDC) */
    exchangeCards: boolean;

    /* ── Timeout ─────────────────────────────────────────── */
    /** Temps par tour en millisecondes (0 = pas de timeout) */
    turnTimeoutMs: number;

    /* ── Abandon ─────────────────────────────────────────── */
    /** "bot"      = un bot prend la main jusqu'à la fin
     *  "mmr_loss" = le joueur perd du MMR, la partie continue sans lui */
    abandonBehavior: "bot" | "mmr_loss";
}

/** Valeurs par défaut utilisées si aucune option n'est fournie. */
export const DEFAULT_CONFIG: GameConfig = {
    minPlayers: 3,
    maxPlayers: 7,


    enableRevolution: true,
    revolutionResetsTrick: true,
    startRule: "three_of_clubs",
    exchangeCards: true,
    turnTimeoutMs: 25_000,
    abandonBehavior: "bot",
};

/**
 * Fusionne les options fournies par le créateur avec les valeurs par défaut.
 */
export function buildConfig(overrides: Partial<GameConfig> = {}): GameConfig {
    return { ...DEFAULT_CONFIG, ...overrides };
}
