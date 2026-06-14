import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export enum GamePhase {
    LOBBY = "LOBBY",
    DEAL = "DEAL",
    EXCHANGE = "EXCHANGE",
    PLAY = "PLAY",
    RESULTS = "RESULTS"
}

export class Card extends Schema {
    @type("string") suit: string;
    @type("string") rank: string;

    constructor(suit: string, rank: string) {
        super();
        this.suit = suit;
        this.rank = rank;
    }
}

export class Player extends Schema {
    @type("string") id: string;
    @type("string") username: string;
    @type("string") avatarUrl: string = "";
    @type("boolean") connected: boolean = true;
    @type("boolean") isReady: boolean = false;
    @type("string") role: string = "NEUTRE"; // PRESIDENT, VICE_PRESIDENT, NEUTRE, VICE_TDC, TDC
    @type("number") handCount: number = 0;
    @type([Card]) hand = new ArraySchema<Card>();
    @type("boolean") isSpectator: boolean = false;
    @type("number") score: number = 0;

    constructor(id: string, username: string) {
        super();
        this.id = id;
        this.username = username;
    }
}

export class GameState extends Schema {
    @type("string") phase: GamePhase = GamePhase.LOBBY;
    @type("string") code: string = ""; // 4-char display code
    @type("string") currentTurnPlayerId: string = "";
    @type({ map: Player }) players = new MapSchema<Player>();
    @type([Card]) currentTrick = new ArraySchema<Card>();
    @type("string") lastTrickWinnerId: string = "";
    @type("number") consecutivePasses: number = 0;
    @type(["string"]) finishedPlayers = new ArraySchema<string>();

    // Configuration
    @type("number") minPlayers: number = 3;
    @type("number") maxPlayers: number = 7;

    // Multi-manche
    @type("number") roundNumber: number = 0;

    // Type du pli courant (single, pair, triple, quad, sequence)
    @type("string") currentTrickType: string = "";

    // Track identical cards played to force next player / close trick
    @type("number") activeConsecutiveCards: number = 0;
    @type("string") isForcedRank: string = "";
    
    // Status of Revolution
    @type("boolean") isRevolution: boolean = false;
}
