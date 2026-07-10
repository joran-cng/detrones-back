import express from "express";
import cors from "cors";
import http from "http";
import { Server, LobbyRoom } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { MatchRoom } from "./rooms/MatchRoom";
import { logBackUrlConfig } from "./config/backUrl";

const PORT = Number(process.env.PORT || 2567);

logBackUrlConfig();

const app = express();

// ✅ CORS registered FIRST — before Colyseus attaches its matchmake routes
app.use(cors({
    origin: true,       // Reflect the request origin
    credentials: true,  // Allow withCredentials requests from Colyseus.js
}));

app.use(express.json());

const httpServer = http.createServer(app);

const gameServer = new Server({
    transport: new WebSocketTransport({
        server: httpServer,
    }),
});

gameServer.define("lobby", LobbyRoom);
gameServer.define("match", MatchRoom).enableRealtimeListing();

// Custom REST endpoints for room listing
app.get("/rooms", (req, res) => {
    res.json([...MatchRoom.activeRooms.values()]);
});

app.get("/roomByCode/:code", (req, res) => {
    const found = [...MatchRoom.activeRooms.values()].find(
        (r) => r.code === req.params.code.toUpperCase()
    );
    if (found) {
        res.json({ roomId: found.roomId, found: true });
    } else {
        res.status(404).json({ found: false });
    }
});

app.use("/colyseus", monitor());

gameServer.listen(PORT).then(() => {
    console.log(`✅ Game server listening on http://localhost:${PORT}`);
}).catch((err) => {
    console.error("Failed to start game server:", err);
    process.exit(1);
});
