import { Room, Client } from "colyseus";
import { ArraySchema } from "@colyseus/schema";
import { GameState, Player, GamePhase, Card } from "./schema/GameState";
import { Deck } from "./logic/Deck";
import { Rules, CombinationType } from "./logic/Rules";
import { GameConfig, buildConfig } from "./logic/GameConfig";
import { resolveMatchEndUrl } from "../config/backUrl";

export class MatchRoom extends Room<GameState> {
    maxClients = 7;

    // ── Plain data (bypass Schema encoding issues) ──────────────────
    private playerHands: Map<string, { suit: string; rank: string }[]> = new Map();
    private plainTrick: { suit: string; rank: string }[] = [];
    private plainFinished: string[] = [];
    private losers: string[] = [];
    private lastTrickWinnerId: string = "";
    private consecutivePasses: number = 0;
    private createdAt: number = Date.now();
    private playerAvatars: Map<string, string> = new Map();

    // ── Configuration ───────────────────────────────────────────────
    private config: GameConfig = buildConfig();

    // ── Turn timeout handle ─────────────────────────────────────────
    private turnTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Previous round roles (for exchanges) ────────────────────────
    private previousRoles: Map<string, string> = new Map();

    // ── Exchange phase ───────────────────────────────────────────────
    private pendingExchanges: Map<string, { targetId: string; count: number; received: { suit: string; rank: string }[] }> = new Map();
    private exchangeTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Registry ────────────────────────────────────────────────────
    static activeRooms: Map<string, {
        roomId: string;
        code: string;
        clients: number;
        maxClients: number;
        createdAt: number;
        players: { username: string; avatarUrl: string; isHost: boolean }[];
    }> = new Map();

    static generateRoomId(): string {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let id = "";
        for (let i = 0; i < 4; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    isPlayerFinished(sessionId: string): boolean {
        const player = this.state.players.get(sessionId);
        if (player && player.isSpectator) {
            return true;
        }
        return this.plainFinished.includes(sessionId) || this.losers.includes(sessionId);
    }

    checkPlayerFinished(sessionId: string, hand: any[], playedCards: any[]) {
        if (hand.length === 0) {
            const finishedWithTwo = playedCards.some((c: any) => c.rank === "2");
            if (finishedWithTwo) {
                this.losers.push(sessionId);
                const player = this.state.players.get(sessionId);
                this.broadcast("chat_message", {
                    sender: "🎮 Système",
                    text: `⚠️ ${player?.username || "Un joueur"} a fini avec un 2 ! Il est condamné à être Trou du Cul.`,
                    timestamp: Date.now(),
                });
            } else {
                const isFirstToFinish = this.plainFinished.length === 0;
                this.plainFinished.push(sessionId);

                if (isFirstToFinish) {
                    // President closes the trick
                    this.plainTrick = [];
                    this.state.currentTrickType = "";
                    this.state.activeConsecutiveCards = 0;
                    this.state.isForcedRank = "";
                    this.consecutivePasses = 0;
                    this.lastTrickWinnerId = sessionId;

                    const player = this.state.players.get(sessionId);
                    this.broadcast("chat_message", {
                        sender: "👑 Président",
                        text: `👑 ${player?.username || "Un joueur"} a terminé en premier(e) et devient le/la Président(e) ! Le pli est fermé.`,
                        timestamp: Date.now(),
                    });
                }
            }
        }
    }

    /* ================================================================
     *  BROADCAST
     * ================================================================ */

    broadcastState() {
        const players: any[] = [];
        let index = 0;
        this.state.players.forEach((p, key) => {
            const hand = this.playerHands.get(key) || [];
            players.push({
                id: p.id,
                sessionId: key,
                username: p.username,
                avatarUrl: p.avatarUrl,
                connected: p.connected,
                role: p.role,
                handCount: hand.length,
                score: p.score,
                isHost: index === 0,
            });
            index++;
        });

        const shared = {
            phase: this.state.phase,
            code: this.state.code,
            currentTurnPlayerId: this.state.currentTurnPlayerId,
            currentTrick: this.plainTrick,
            currentTrickType: this.state.currentTrickType,
            isForcedRank: this.state.isForcedRank,
            activeConsecutiveCards: this.state.activeConsecutiveCards,
            players,
            finishedPlayers: [...this.plainFinished, ...this.losers.slice().reverse()],
            roundNumber: this.state.roundNumber,
            config: this.config,
            reversed: this.state.isRevolution,
            pendingExchanges: Array.from(this.pendingExchanges.entries()).map(([sessionId, ex]) => ({
                sessionId,
                count: ex.count,
            })),
        };

        this.broadcast("state_update", shared);

        // Send each player their own hand privately
        this.clients.forEach(client => {
            const hand = this.playerHands.get(client.sessionId) || [];
            client.send("my_hand", hand);
        });
    }

    /* ================================================================
     *  ON CREATE
     * ================================================================ */

    onCreate(options: any) {
        this.setState(new GameState());
        const code = options.code || MatchRoom.generateRoomId();
        this.state.code = code;
        this.state.phase = GamePhase.LOBBY;
        this.createdAt = Date.now();
        this.setMetadata({
            code,
            createdAt: this.createdAt,
            players: []
        });
        this.unlock();

        // Build config from options
        this.config = buildConfig(options.config || {});
        this.maxClients = this.config.maxPlayers;
        this.state.minPlayers = this.config.minPlayers;
        this.state.maxPlayers = this.config.maxPlayers;

        MatchRoom.activeRooms.set(this.roomId, {
            roomId: this.roomId,
            code,
            clients: 0,
            maxClients: this.maxClients,
            createdAt: this.createdAt,
            players: [],
        });
        console.log("[registry] room created:", this.roomId, "code:", code);

        // ─── start_game ──────────────────────────────────────────────
        this.onMessage("start_game", (client) => {
            const firstKey = this.getOrderedKeys()[0];
            if (client.sessionId !== firstKey) return;

            const playerCount = this.state.players.size;
            if (playerCount < this.config.minPlayers) {
                client.send("error", { message: `Not enough players (min ${this.config.minPlayers})` });
                return;
            }

            this.startRound();
        });

        // ─── next_round ──────────────────────────────────────────────
        this.onMessage("next_round", (client) => {
            if (this.state.phase !== GamePhase.RESULTS) return;

            const firstKey = this.state.players.keys().next().value;
            if (client.sessionId !== firstKey) return;

            this.startRound();
        });

        // ─── play_card ───────────────────────────────────────────────
        this.onMessage("play_card", (client, message: { cards: { suit: string; rank: string }[] }) => {
            if (this.state.phase !== GamePhase.PLAY) return;
            if (client.sessionId !== this.state.currentTurnPlayerId) return;

            const hand = this.playerHands.get(client.sessionId);
            if (!hand) return;

            // Validate all cards exist in hand
            for (const pc of message.cards) {
                const found = hand.some(c => c.suit === pc.suit && c.rank === pc.rank);
                if (!found) {
                    client.send("error", { message: "Card not in hand" });
                    return;
                }
            }

            // Build Card objects for rule validation
            const playedCards = message.cards.map(c => new Card(c.suit, c.rank));
            const trickCards = this.plainTrick.map(c => new Card(c.suit, c.rank));

            if (!Rules.isValidMove(playedCards, trickCards, this.config, this.state.isForcedRank, this.state.activeConsecutiveCards, this.state.isRevolution)) {
                const fs = require('fs');
                const logMsg = `[Invalid Move] Player ${client.sessionId} tried to play: ${JSON.stringify(message.cards)} on trick: ${JSON.stringify(trickCards)} activeConsecutive: ${this.state.activeConsecutiveCards} forcedRank: ${this.state.isForcedRank}\n`;
                fs.appendFileSync('invalid_moves.log', logMsg);
                console.warn(logMsg);
                client.send("error", { message: "Invalid move" });
                return;
            }

            // Remove played cards from hand
            for (const pc of message.cards) {
                const idx = hand.findIndex(c => c.suit === pc.suit && c.rank === pc.rank);
                if (idx !== -1) hand.splice(idx, 1);
            }

            // Broadcast card played animation to all clients
            const player = this.state.players.get(client.sessionId);
            this.broadcast("card_played", {
                sessionId: client.sessionId,
                username: player?.username || "?",
                cards: message.cards,
                timestamp: Date.now(),
            });

            const comboType = Rules.getCombinationType(playedCards, this.config);

            // ── Special 2: burns the trick (Sauf en révolution) ──
            if (!this.state.isRevolution && playedCards.every(c => c.rank === "2")) {
                // Show the card(s) on the table before clearing the trick
                this.plainTrick = message.cards.map(c => ({ suit: c.suit, rank: c.rank }));
                this.state.currentTrickType = comboType;
                this.state.activeConsecutiveCards = message.cards.length;
                this.lastTrickWinnerId = client.sessionId;
                this.consecutivePasses = 0;
                this.broadcastState();

                this.state.currentTurnPlayerId = ""; // lock turn during animation

                this.broadcast("chat_message", {
                    sender: "🎮 Système",
                    text: `✂️ ${player?.username || "Un joueur"} pose un 2 et coupe le pli !`,
                    timestamp: Date.now(),
                });

                setTimeout(() => {
                    this.plainTrick = [];
                    this.state.currentTrickType = "";
                    this.state.activeConsecutiveCards = 0;
                    this.state.isForcedRank = "";
                    this.consecutivePasses = 0;
                    this.lastTrickWinnerId = client.sessionId;

                    this.checkPlayerFinished(client.sessionId, hand, message.cards);

                    this.setCurrentPlayer(client.sessionId);
                    this.broadcastState();
                }, 1500);
                return;
            }

            // ── Quad ──
            if (comboType === "quad" && this.config.enableRevolution) {
                // Toggle Revolution
                this.state.isRevolution = !this.state.isRevolution;
                this.broadcast("chat_message", {
                    sender: "🎮 Système",
                    text: this.state.isRevolution ? "🌪️ RÉVOLUTION ! Les cartes sont inversées !" : "🌪️ CONTRE-RÉVOLUTION ! Ordre normal rétabli !",
                    timestamp: Date.now(),
                });

                if (this.config.revolutionResetsTrick) {
                    this.plainTrick = message.cards.map(c => ({ suit: c.suit, rank: c.rank }));
                    this.state.currentTrickType = comboType;
                    this.state.activeConsecutiveCards = 4;
                    this.lastTrickWinnerId = client.sessionId;
                    this.broadcastState();

                    this.state.currentTurnPlayerId = ""; // lock turn

                    setTimeout(() => {
                        // Quad resets the trick → player leads again
                        this.plainTrick = [];
                        this.state.currentTrickType = "";
                        this.state.activeConsecutiveCards = 0;
                        this.state.isForcedRank = "";
                        this.consecutivePasses = 0;
                        this.lastTrickWinnerId = client.sessionId;

                        this.checkPlayerFinished(client.sessionId, hand, message.cards);

                        this.setCurrentPlayer(client.sessionId);

                        // Re-sort everyone's hands with new order
                        this.resortAllHands();
                        this.broadcastState();
                    }, 1500);
                    return;
                }

                // Re-sort everyone's hands with new order
                this.resortAllHands();
            }

            // ── Normal play & Consecutive/Quad Check ──
            // If the trick continues, check if the played rank matches the trick rank
            let newConsecutiveCount = message.cards.length;

            if (this.plainTrick.length > 0 && this.plainTrick[0].rank === message.cards[0].rank) {
                newConsecutiveCount += this.state.activeConsecutiveCards;
            }

            this.plainTrick = message.cards.map(c => ({ suit: c.suit, rank: c.rank }));
            this.state.currentTrickType = comboType;
            this.state.activeConsecutiveCards = newConsecutiveCount;
            this.lastTrickWinnerId = client.sessionId;
            this.consecutivePasses = 0;

            // Update forced rank logic: "ou rien" triggers when 2+ same-rank plays
            // accumulate across multiple turns, meaning the current active count
            // is strictly greater than the cards played in this specific turn alone.
            if (
                this.state.activeConsecutiveCards >= 2 &&
                this.state.activeConsecutiveCards > message.cards.length &&
                this.state.activeConsecutiveCards < 4
            ) {
                this.state.isForcedRank = message.cards[0].rank;
            } else {
                this.state.isForcedRank = "";
            }

            // Check if player finished
            this.checkPlayerFinished(client.sessionId, hand, message.cards);

            // ── Trick closed by quad accumulation ──
            if (this.state.activeConsecutiveCards >= 4) {
                this.broadcast("chat_message", {
                    sender: "🎮 Système",
                    text: `🔥 Un carré s'est formé sur le pli ! Le pli est ramassé.`,
                    timestamp: Date.now(),
                });

                this.broadcastState();
                
                this.state.currentTurnPlayerId = ""; // lock turn

                setTimeout(() => {
                    this.plainTrick = [];
                    this.state.currentTrickType = "";
                    this.state.activeConsecutiveCards = 0;
                    this.state.isForcedRank = "";
                    this.consecutivePasses = 0;

                    this.setCurrentPlayer(client.sessionId);
                    this.broadcastState();
                }, 1500);
                return;
            }

            this.nextTurn();
            this.broadcastState();
        });

        // ─── pass ────────────────────────────────────────────────────
        this.onMessage("pass", (client) => {
            if (this.state.phase !== GamePhase.PLAY) return;
            if (client.sessionId !== this.state.currentTurnPlayerId) return;
            this.nextTurn(true);
            this.broadcastState();
        });

        // ─── exchange_select (for manual exchange selection) ─────────
        this.onMessage("exchange_select", (client, message: { cards: { suit: string; rank: string }[] }) => {
            if (this.state.phase !== GamePhase.EXCHANGE) return;
            this.handleExchangeSelect(client, message.cards);
        });

        // ─── abandon ─────────────────────────────────────────────────
        this.onMessage("abandon", (client) => {
            if (this.state.phase !== GamePhase.PLAY) return;
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            console.log(`[abandon] ${player.username} has abandoned`);

            this.broadcast("chat_message", {
                sender: "🎮 Système",
                text: `${player.username} a abandonné la partie.`,
                timestamp: Date.now(),
            });

            if (this.config.abandonBehavior === "mmr_loss") {
                // Remove the player from the active players: they finish last
                if (!this.isPlayerFinished(client.sessionId)) {
                    this.losers.push(client.sessionId);

                    const activePlayers = Array.from(this.state.players.keys())
                        .filter(id => !this.isPlayerFinished(id));

                    if (activePlayers.length <= 1) {
                        if (activePlayers.length === 1) {
                            this.plainFinished.push(activePlayers[0]);
                        }
                        this.endRound();
                    }
                }
            } else {
                // "bot" behavior: mark as bot-controlled, auto-pass each turn
                player.username = `🤖 ${player.username}`;
                player.connected = false;
                // The bot will auto-pass on its turns (handled in startTurnTimer)
            }

            this.broadcastState();
        });

        // ─── chat ────────────────────────────────────────────────────
        this.onMessage("kick_player", (client, { targetSessionId }) => {
            const firstKey = this.getOrderedKeys()[0];
            if (client.sessionId !== firstKey) return;
            const player = this.state.players.get(targetSessionId);
            if (!player) return;
            this.state.players.delete(targetSessionId);
            this.playerHands.delete(targetSessionId);
            this.playerAvatars.delete(targetSessionId);
            this.broadcast("chat_message", {
                sender: "🎮 Système",
                text: `${player.username} a été expulsé.`,
                timestamp: Date.now(),
            });
            this.updateLobbyMetadata();
            this.broadcastState();
        });

        this.onMessage("chat_message", (client, message: { text: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            this.broadcast("chat_message", {
                sender: player.username,
                text: message.text,
                timestamp: Date.now(),
            });
        });
    }

    /* ================================================================
     *  START ROUND
     * ================================================================ */

    startRound() {
        this.state.roundNumber++;
        const isFirstRound = this.state.roundNumber === 1;

        // Save roles from previous round for exchanges
        if (!isFirstRound) {
            this.previousRoles.clear();
            this.state.players.forEach((p, key) => {
                this.previousRoles.set(key, p.role);
            });
            // Personalized role animation for each player when relaunching
            this.sendRoleReveal((sessionId) => this.previousRoles.get(sessionId) || "NEUTRE");
        }

        // Make sure all spectators become active players for the new round
        this.state.players.forEach(p => {
            p.isSpectator = false;
        });

        // Deal cards
        const deck = new Deck();
        deck.shuffle();
        this.plainFinished = [];
        this.losers = [];

        const playerIds = this.getOrderedKeys();
        const hands = deck.deal(playerIds.length);

        playerIds.forEach((sessionId, i) => {
            const plainHand = hands[i].map(c => ({ suit: c.suit, rank: c.rank }));
            // Sort the hand
            Rules.sortHand(plainHand, this.state.isRevolution);
            this.playerHands.set(sessionId, plainHand);
            console.log(`[deal] ${this.state.players.get(sessionId)!.username}: ${plainHand.length} cards`);
        });

        // Reset state
        this.plainTrick = [];
        this.consecutivePasses = 0;
        this.state.currentTrickType = "";
        this.state.activeConsecutiveCards = 0;
        this.state.isForcedRank = "";
        this.state.isRevolution = false;

        // Perform exchanges if not first round and config permits
        if (!isFirstRound && this.config.exchangeCards) {
            this.performExchanges(playerIds);
            // performExchanges will handle the phase transition
            // (EXCHANGE if manual selection needed, or direct PLAY if no exchanges)
            if (this.pendingExchanges.size > 0) {
                return; // Wait for exchange selections
            }
        }

        // Find starting player
        let starterSessionId = Rules.findStartingPlayer(
            this.playerHands,
            this.config
        );
        
        const tdcId = this.findPlayerByRole("TDC");
        if (tdcId) {
            starterSessionId = tdcId;
        }

        this.state.currentTurnPlayerId = starterSessionId;
        this.state.phase = GamePhase.PLAY;

        console.log("[game] Round", this.state.roundNumber, "started, first player:",
            this.state.players.get(starterSessionId)!.username);

        this.startTurnTimer();
        this.broadcastState();
    }

    /* ================================================================
     *  EXCHANGES
     * ================================================================ */

    performExchanges(playerIds: string[]) {
        const presidentId = this.findPlayerByRole("PRESIDENT");
        const tdcId = this.findPlayerByRole("TDC");
        const vpId = this.findPlayerByRole("VICE_PRESIDENT");
        const vtdcId = this.findPlayerByRole("VICE_TDC");

        // Step 1: TDC and VTDC auto-give their best cards
        // Step 2: President and VP must manually choose which cards to give back

        this.pendingExchanges = new Map();

        // Président ↔ TDC : 2 cartes
        if (presidentId && tdcId) {
            const presHand = this.playerHands.get(presidentId)!;
            const tdcHand = this.playerHands.get(tdcId)!;

            // TDC gives their 2 best cards to Président (automatic)
            Rules.sortHand(tdcHand, this.state.isRevolution);
            const cardsFromTdc: { suit: string; rank: string }[] = [];
            for (let i = 0; i < 2 && tdcHand.length > 0; i++) {
                cardsFromTdc.push(tdcHand.splice(tdcHand.length - 1, 1)[0]);
            }
            presHand.push(...cardsFromTdc);
            Rules.sortHand(presHand, this.state.isRevolution);
            Rules.sortHand(tdcHand, this.state.isRevolution);

            // President must choose 2 cards to give back
            this.pendingExchanges.set(presidentId, {
                targetId: tdcId,
                count: 2,
                received: cardsFromTdc,
            });

            this.broadcast("chat_message", {
                sender: "🎮 Système",
                text: `Le TDC donne ses 2 meilleures cartes au Président. Le Président doit choisir 2 cartes à donner en retour.`,
                timestamp: Date.now(),
            });
        }

        // Vice-Président ↔ Vice-TDC : 1 carte
        if (vpId && vtdcId) {
            const vpHand = this.playerHands.get(vpId)!;
            const vtdcHand = this.playerHands.get(vtdcId)!;

            // Vice-TDC gives their 1 best card to Vice-Président (automatic)
            Rules.sortHand(vtdcHand, this.state.isRevolution);
            const cardsFromVtdc: { suit: string; rank: string }[] = [];
            cardsFromVtdc.push(vtdcHand.splice(vtdcHand.length - 1, 1)[0]);
            vpHand.push(...cardsFromVtdc);
            Rules.sortHand(vpHand, this.state.isRevolution);
            Rules.sortHand(vtdcHand, this.state.isRevolution);

            // Vice-President must choose 1 card to give back
            this.pendingExchanges.set(vpId, {
                targetId: vtdcId,
                count: 1,
                received: cardsFromVtdc,
            });

            this.broadcast("chat_message", {
                sender: "🎮 Système",
                text: `Le Vice-TDC donne sa meilleure carte au Vice-Président. Le Vice-Président doit choisir 1 carte à donner en retour.`,
                timestamp: Date.now(),
            });
        }

        if (this.pendingExchanges.size > 0) {
            // Enter EXCHANGE phase - wait for President/VP to select cards
            this.state.phase = GamePhase.EXCHANGE;
            this.broadcastState();

            // Notify the players who must choose
            for (const [sessionId, exchange] of this.pendingExchanges.entries()) {
                const client = this.clients.find(c => c.sessionId === sessionId);
                if (client) {
                    client.send("exchange_request", {
                        count: exchange.count,
                        received: exchange.received,
                    });
                }
            }

            // Auto-complete after 30 seconds if no response
            this.exchangeTimer = setTimeout(() => {
                this.autoCompleteExchanges();
            }, 30000);
        } else {
            // No exchanges needed, reset roles
            this.state.players.forEach((p) => {
                p.role = "NEUTRE";
            });
        }
    }

    handleExchangeSelect(client: Client, selectedCards: { suit: string; rank: string }[]) {
        const exchange = this.pendingExchanges.get(client.sessionId);
        if (!exchange) {
            client.send("error", { message: "Pas d'échange en attente." });
            return;
        }

        if (selectedCards.length !== exchange.count) {
            client.send("error", { message: `Vous devez sélectionner exactement ${exchange.count} carte(s).` });
            return;
        }

        const hand = this.playerHands.get(client.sessionId)!;

        // Validate all selected cards exist in hand
        for (const sc of selectedCards) {
            const found = hand.some(c => c.suit === sc.suit && c.rank === sc.rank);
            if (!found) {
                client.send("error", { message: "Carte invalide." });
                return;
            }
        }

        // Remove selected cards from giver's hand and add to receiver
        const targetHand = this.playerHands.get(exchange.targetId)!;
        for (const sc of selectedCards) {
            const idx = hand.findIndex(c => c.suit === sc.suit && c.rank === sc.rank);
            if (idx !== -1) {
                targetHand.push(hand.splice(idx, 1)[0]);
            }
        }

        Rules.sortHand(hand, this.state.isRevolution);
        Rules.sortHand(targetHand, this.state.isRevolution);

        const player = this.state.players.get(client.sessionId);
        this.broadcast("chat_message", {
            sender: "🎮 Système",
            text: `${player?.username} a choisi ses cartes à échanger.`,
            timestamp: Date.now(),
        });

        this.pendingExchanges.delete(client.sessionId);
        this.broadcastState();

        // If all exchanges are done, start the play phase
        if (this.pendingExchanges.size === 0) {
            this.startPlayAfterExchange();
        }
    }

    autoCompleteExchanges() {
        // Auto-select worst cards for any remaining exchanges
        for (const [sessionId, exchange] of this.pendingExchanges.entries()) {
            const hand = this.playerHands.get(sessionId)!;
            const targetHand = this.playerHands.get(exchange.targetId)!;

            Rules.sortHand(hand, this.state.isRevolution);
            for (let i = 0; i < exchange.count && hand.length > 0; i++) {
                targetHand.push(hand.splice(0, 1)[0]);
            }
            Rules.sortHand(hand, this.state.isRevolution);
            Rules.sortHand(targetHand, this.state.isRevolution);

            const player = this.state.players.get(sessionId);
            this.broadcast("chat_message", {
                sender: "🎮 Système",
                text: `⏱️ Temps écoulé ! ${player?.username} donne automatiquement ses pires cartes.`,
                timestamp: Date.now(),
            });
        }

        this.pendingExchanges.clear();
        this.startPlayAfterExchange();
    }

    startPlayAfterExchange() {
        if (this.exchangeTimer) {
            clearTimeout(this.exchangeTimer);
            this.exchangeTimer = null;
        }

        // Reset roles to NEUTRE for the new round
        this.state.players.forEach((p) => {
            p.role = "NEUTRE";
        });

        // Find starting player
        let starterSessionId = Rules.findStartingPlayer(
            this.playerHands,
            this.config
        );
        
        const tdcId = this.findPlayerByRole("TDC");
        if (tdcId) {
            starterSessionId = tdcId;
        }

        this.state.currentTurnPlayerId = starterSessionId;
        this.state.phase = GamePhase.PLAY;

        console.log("[game] Exchange complete, play starts, first player:",
            this.state.players.get(starterSessionId)!.username);

        this.startTurnTimer();
        this.broadcastState();
    }

    findPlayerByRole(role: string): string | null {
        for (const [id, prevRole] of this.previousRoles.entries()) {
            if (prevRole === role && this.state.players.has(id)) {
                return id;
            }
        }
        return null;
    }

    /* ================================================================
     *  TURN MANAGEMENT
     * ================================================================ */

    nextTurn(passed: boolean = false) {
        this.clearTurnTimer();

        if (passed) {
            this.consecutivePasses++;
            this.state.isForcedRank = "";
        }

        const activePlayers = this.getOrderedKeys().filter(id => !this.isPlayerFinished(id));

        // ── Trick cleared: everyone passed except last player ──
        if (this.consecutivePasses >= activePlayers.length - 1 && this.plainTrick.length > 0) {
            this.plainTrick = [];
            this.state.currentTrickType = "";
            this.state.activeConsecutiveCards = 0;
            this.state.isForcedRank = "";
            this.consecutivePasses = 0;

            // Winner starts next trick
            this.setCurrentPlayer(this.lastTrickWinnerId);
            this.startTurnTimer();
            return;
        }

        // ── Round over: 1 or fewer players remaining ──
        if (activePlayers.length <= 1) {
            if (activePlayers.length === 1) {
                this.plainFinished.push(activePlayers[0]);
            }
            this.endRound();
            return;
        }

        // ── Next active player ──
        const allKeys = this.getOrderedKeys();
        let currentIndex = allKeys.indexOf(this.state.currentTurnPlayerId);
        let nextIndex = (currentIndex + 1) % allKeys.length;
        let attempts = 0;

        while (this.isPlayerFinished(allKeys[nextIndex]) && attempts < allKeys.length) {
            nextIndex = (nextIndex + 1) % allKeys.length;
            attempts++;
        }

        this.state.currentTurnPlayerId = allKeys[nextIndex];
        this.startTurnTimer();
    }

    /**
     * Set the current player, skipping to next active if the player has finished.
     */
    setCurrentPlayer(sessionId: string) {
        if (this.isPlayerFinished(sessionId)) {
            // This player has already finished; find the next active one
            const allKeys = this.getOrderedKeys();
            let idx = allKeys.indexOf(sessionId);
            let attempts = 0;
            do {
                idx = (idx + 1) % allKeys.length;
                attempts++;
            } while (this.isPlayerFinished(allKeys[idx]) && attempts < allKeys.length);

            const activePlayers = allKeys.filter(id => !this.isPlayerFinished(id));
            if (activePlayers.length <= 1) {
                if (activePlayers.length === 1) {
                    this.plainFinished.push(activePlayers[0]);
                }
                this.endRound();
                return;
            }

            this.state.currentTurnPlayerId = allKeys[idx];
        } else {
            this.state.currentTurnPlayerId = sessionId;
        }
        this.startTurnTimer();
    }



    /* ================================================================
     *  TURN TIMER
     * ================================================================ */

    startTurnTimer() {
        this.clearTurnTimer();

        if (this.config.turnTimeoutMs <= 0) return;

        const currentPlayerId = this.state.currentTurnPlayerId;

        // Check if current player is a disconnected bot → auto-pass immediately
        const player = this.state.players.get(currentPlayerId);
        if (player && !player.connected) {
            // Bot auto-pass after a short delay for visual feedback
            this.turnTimer = setTimeout(() => {
                if (this.state.currentTurnPlayerId === currentPlayerId) {
                    console.log(`[bot] Auto-pass for ${player.username}`);
                    this.nextTurn(true);
                    this.broadcastState();
                }
            }, 2000);
            return;
        }

        this.turnTimer = setTimeout(() => {
            // Double-check it's still this player's turn
            if (this.state.currentTurnPlayerId === currentPlayerId && this.state.phase === GamePhase.PLAY) {
                console.log(`[timeout] Auto-pass for player ${currentPlayerId}`);

                // Notify the player
                const client = this.clients.find(c => c.sessionId === currentPlayerId);
                if (client) {
                    client.send("error", { message: "Temps écoulé ! Passe automatique." });
                }

                this.broadcast("chat_message", {
                    sender: "🎮 Système",
                    text: `⏱️ Temps écoulé pour ${player?.username || "un joueur"} — passe automatique.`,
                    timestamp: Date.now(),
                });

                this.nextTurn(true);
                this.broadcastState();
            }
        }, this.config.turnTimeoutMs);
    }

    clearTurnTimer() {
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
    }

    /* ================================================================
     *  END ROUND / ROLES
     * ================================================================ */

    endRound() {
        this.clearTurnTimer();
        this.state.phase = GamePhase.RESULTS;
        this.assignRoles();
    }

    /** Send a personalized role-reveal event to each connected client */
    sendRoleReveal(getRole: (sessionId: string) => string) {
        for (const client of this.clients) {
            const role = getRole(client.sessionId);
            client.send("role_reveal", { role });
        }
    }

    assignRoles() {
        const playerCount = this.state.players.size;
        const ranking = [...this.plainFinished, ...this.losers.slice().reverse()];

        ranking.forEach((sessionId, index) => {
            const player = this.state.players.get(sessionId);
            if (!player) return;
            
            let role = "NEUTRE";
            let delta = 0;

            if (index === 0) {
                role = "PRESIDENT";
                delta = 30;
            } else if (index === playerCount - 1) {
                role = "TDC";
                delta = -30;
            } else if (index === 1 && playerCount >= 4) {
                role = "VICE_PRESIDENT";
                delta = 15;
            } else if (index === playerCount - 2 && playerCount >= 4) {
                role = "VICE_TDC";
                delta = -15;
            }

            player.role = role;
            player.score = (player.score || 0) + delta;
        });

        // Personalized end-of-round role animation for each player
        this.sendRoleReveal((sessionId) => this.state.players.get(sessionId)?.role || "NEUTRE");

        let summary = "🏆 **Classement de la manche** 🏆\n";
        ranking.forEach((sessionId, index) => {
            const p = this.state.players.get(sessionId);
            if (p) {
                const icon = p.role === "PRESIDENT" ? "👑" : p.role === "TDC" ? "💩" : "👤";
                summary += `${index + 1}. ${p.username} - ${p.role} ${icon} (${p.score} pts)\n`;
            }
        });

        this.broadcast("chat_message", {
            sender: "🎮 Système",
            text: summary,
            timestamp: Date.now(),
        });

        // Notify Nuxt backend to update MMR
        const playersData = Array.from(this.state.players.values()).map(p => ({
            username: p.username,
            role: p.role
        }));

        const targetUrl = resolveMatchEndUrl();

        fetch(targetUrl, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "User-Agent": "President-Game-Server/1.0",
                "Accept": "application/json"
            },
            body: JSON.stringify({ players: playersData })
        }).then(async res => {
            if (!res.ok) {
                const text = await res.text().catch(() => "no-body");
                console.error("[MMR] failed. Status:", res.status, "Body:", text, "URL:", targetUrl);
            } else {
                console.log("[MMR] update response:", res.status);
            }
        }).catch(err => {
            console.error("[MMR] fetch error:", err, "URL:", targetUrl);
        });

        this.broadcastState();
    }

    /* ================================================================
     *  UTILITY
     * ================================================================ */

    getOrderedKeys(): string[] {
        return Array.from(this.state.players.entries())
            .sort((a, b) => a[1].seatIndex - b[1].seatIndex)
            .map(e => e[0]);
    }

    resortAllHands() {
        this.playerHands.forEach((hand, sessionId) => {
            Rules.sortHand(hand, this.state.isRevolution);
        });
    }

    updateLobbyMetadata() {
        const playerList: any[] = [];
        this.getOrderedKeys().forEach((key) => {
            const p = this.state.players.get(key)!;
            playerList.push({
                username: p.username,
                avatarUrl: this.playerAvatars.get(key) || "",
                isHost: p.seatIndex === 0,
            });
        });

        this.setMetadata({
            code: this.state.code,
            createdAt: this.createdAt,
            players: playerList
        });

        const reg = MatchRoom.activeRooms.get(this.roomId);
        if (reg) {
            reg.clients = this.clients.length;
            reg.players = playerList;
        }
    }

    /* ================================================================
     *  LIFECYCLE
     * ================================================================ */

    requestJoin(options: any, isNewRoom: boolean) {
        if (this.state.phase === GamePhase.PLAY) {
            const username = options.username || "Anonymous";
            const botUsername = `🤖 ${username}`;
            for (const [sid, p] of this.state.players.entries()) {
                if (!p.connected && (p.username === username || p.username === botUsername)) {
                    return true;
                }
            }
            return false;
        }
        return true;
    }

    async onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined!");
        const username = options.username || "Anonymous";

        let existingSessionId: string | null = null;
        const botUsername = `🤖 ${username}`;
        for (const [sid, p] of this.state.players.entries()) {
            if (!p.connected && (p.username === username || p.username === botUsername)) {
                existingSessionId = sid;
                break;
            }
        }

        if (existingSessionId && this.state.phase !== GamePhase.LOBBY) {
            console.log(`[rejoin] ${username} takes over old session ${existingSessionId}`);
            
            const oldPlayer = this.state.players.get(existingSessionId)!;
            const newPlayer = new Player(client.sessionId, username);
            newPlayer.role = oldPlayer.role;
            newPlayer.avatarUrl = options.avatarUrl || oldPlayer.avatarUrl || "";
            newPlayer.score = oldPlayer.score || 0;
            newPlayer.seatIndex = oldPlayer.seatIndex || 0;
            
            this.state.players.delete(existingSessionId);
            this.state.players.set(client.sessionId, newPlayer);
            
            const hand = this.playerHands.get(existingSessionId) || [];
            this.playerHands.delete(existingSessionId);
            this.playerHands.set(client.sessionId, hand);
            
            if (this.state.currentTurnPlayerId === existingSessionId) {
                this.state.currentTurnPlayerId = client.sessionId;
            }
            if (this.lastTrickWinnerId === existingSessionId) {
                this.lastTrickWinnerId = client.sessionId;
            }
            
            this.plainFinished = this.plainFinished.map(id => id === existingSessionId ? client.sessionId : id);
            this.losers = this.losers.map(id => id === existingSessionId ? client.sessionId : id);
            
            if (this.previousRoles.has(existingSessionId)) {
                this.previousRoles.set(client.sessionId, this.previousRoles.get(existingSessionId)!);
                this.previousRoles.delete(existingSessionId);
            }
            
            this.broadcast("chat_message", {
                sender: "🎮 Système",
                text: `${username} est revenu dans la partie !`,
                timestamp: Date.now(),
            });
            
            this.broadcastState();
            return;
        }

        const player = new Player(client.sessionId, username);
        player.avatarUrl = options.avatarUrl || "";
        if (this.state.phase !== GamePhase.LOBBY) {
            player.isSpectator = true;
        }
        player.seatIndex = this.state.players.size;
        this.state.players.set(client.sessionId, player);

        this.playerAvatars.set(client.sessionId, options.avatarUrl || "");

        const reg = MatchRoom.activeRooms.get(this.roomId);
        if (reg) reg.clients = this.clients.length;

        this.broadcast("chat_message", {
            sender: "🎮 Système",
            text: `${player.username} a rejoint la partie !`,
            timestamp: Date.now(),
        });

        this.broadcastState();
        this.updateLobbyMetadata();
    }

    async onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left!", consented ? "(consented)" : "(disconnected)");
        const player = this.state.players.get(client.sessionId);
        if (player) player.connected = false;
        this.broadcastState();

        if (!consented) {
            try {
                console.log(`[reconnect] waiting for ${client.sessionId}...`);
                await this.allowReconnection(client, 120);
                console.log(`[reconnect] ${client.sessionId} reconnected!`);
                const currentP = this.state.players.get(client.sessionId);
                if (currentP) {
                    currentP.connected = true;
                    if (currentP.username.startsWith("🤖 ")) {
                        currentP.username = currentP.username.substring(3);
                    }
                }
                this.broadcastState();
                return;
            } catch (e) {
                console.log(`[reconnect] ${client.sessionId} timed out`);
            }
        }

        const currentP = this.state.players.get(client.sessionId);
        if (!currentP) return;

        // If in game, the disconnected player becomes a bot (auto-pass)
        if (this.state.phase === GamePhase.PLAY) {
            if (!currentP.username.startsWith("🤖")) {
                currentP.username = `🤖 ${currentP.username}`;
            }
            // If it's their turn, trigger auto-pass
            if (this.state.currentTurnPlayerId === client.sessionId) {
                this.startTurnTimer();
            }
            return; // Don't remove the player while in-game
        }

        // Remove player if in lobby
        this.state.players.delete(client.sessionId);
        this.playerHands.delete(client.sessionId);
        this.playerAvatars.delete(client.sessionId);
        const reg = MatchRoom.activeRooms.get(this.roomId);
        if (reg) reg.clients = this.clients.length;
        this.broadcastState();
        this.updateLobbyMetadata();
    }

    onDispose() {
        this.clearTurnTimer();
        console.log("room", this.roomId, "disposing...");
        MatchRoom.activeRooms.delete(this.roomId);
        console.log("[registry] room removed:", this.roomId);
    }
}
