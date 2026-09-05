const { openDatabase, saveDatabase, closeDatabase } = require('./database');
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {
    createUser,
    getWallet
} = require("./wallet-engine");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || true,
        methods: ["GET", "POST"]
    }
});

app.use(express.json());

/* ===== BASIC SECURITY HEADERS ===== */
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
});

app.use(express.static("public"));

const rooms = new Map();

const ROOM_DIRECTORY = [
    { id: "lex-main", name: "الرئيسية", featured: false },
    { id: "malik-private", name: "غرفة المستشار مالك", featured: true },
    { id: "room-news", name: "الأخبار", featured: false },
    { id: "room-sports", name: "الرياضة", featured: false },
    { id: "room-entertainment", name: "الترفيه", featured: false }
];

function getRoomMeta(roomId) {
    return ROOM_DIRECTORY.find(room => room.id === roomId) || {
        id: roomId,
        name: roomId,
        featured: false
    };
}

function roomsDirectoryState() {
    return ROOM_DIRECTORY.map(meta => {
        const room = rooms.get(meta.id);

        return {
            id: meta.id,
            name: meta.name,
            featured: meta.featured,
            hostName: room?.hostName || null,
            viewerCount: room?.viewers?.size || 0,
            live: Boolean(room?.live),
            online: Boolean(room?.host || room?.viewers?.size)
        };
    });
}

function broadcastRoomsDirectory() {
    io.emit("rooms-directory", roomsDirectoryState());
}

/* ===== ACCOUNT + WALLET FOUNDATION ===== */

/*
 * LexBridge Account + Wallet foundation.
 *
 * This endpoint creates/resolves an account and its wallet.
 * It intentionally does NOT expose public credit/debit operations.
 */

app.post("/api/account", async (req, res) => {
    try {
        const username = String(req.body?.username || "").trim();
        const displayName =
            req.body?.displayName == null
                ? null
                : String(req.body.displayName).trim();

        if (!username) {
            return res.status(400).json({
                success: false,
                error: "USERNAME_REQUIRED"
            });
        }

        if (username.length < 2 || username.length > 50) {
            return res.status(400).json({
                success: false,
                error: "USERNAME_LENGTH_INVALID"
            });
        }

        const account = await createUser(username, displayName);
        const wallet = await getWallet(account.userId);

        if (!wallet) {
            return res.status(500).json({
                success: false,
                error: "WALLET_NOT_FOUND"
            });
        }

        return res.status(account.created ? 201 : 200).json({
            success: true,
            account: {
                userId: account.userId,
                username,
                displayName,
                created: account.created
            },
            wallet: {
                walletId: wallet.walletId,
                currency: wallet.currency,
                availableMinor: wallet.availableMinor,
                reservedMinor: wallet.reservedMinor,
                status: wallet.status,
                version: wallet.version
            }
        });
    } catch (error) {
        console.error("ACCOUNT_OPERATION_ERROR:", error.message);

        return res.status(500).json({
            success: false,
            error: "ACCOUNT_OPERATION_FAILED"
        });
    }
});

app.get("/api/account/:userId/wallet", async (req, res) => {
    try {
        const userId = String(req.params.userId || "").trim();

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "USER_ID_REQUIRED"
            });
        }

        const wallet = await getWallet(userId);

        if (!wallet) {
            return res.status(404).json({
                success: false,
                error: "WALLET_NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            wallet: {
                walletId: wallet.walletId,
                userId: wallet.userId,
                currency: wallet.currency,
                availableMinor: wallet.availableMinor,
                reservedMinor: wallet.reservedMinor,
                status: wallet.status,
                version: wallet.version
            }
        });
    } catch (error) {
        console.error("WALLET_READ_ERROR:", error.message);

        return res.status(500).json({
            success: false,
            error: "WALLET_READ_FAILED"
        });
    }
});

/* ===== END ACCOUNT + WALLET FOUNDATION ===== */

/* ===== USER ROOMS API ===== */
app.post("/api/rooms", async (req, res) => {
  try {
    const userId = String(req.body?.userId || "").trim();
    const name = String(req.body?.name || "").trim();
    const description =
      req.body?.description == null
        ? null
        : String(req.body.description).trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "USER_ID_REQUIRED"
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "ROOM_NAME_REQUIRED"
      });
    }

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        success: false,
        error: "ROOM_NAME_LENGTH_INVALID"
      });
    }

    const db = await openDatabase();

    const userResult = db.exec(`
      SELECT user_id, username, display_name, status
      FROM users
      WHERE user_id = ?
      LIMIT 1
    `, [userId]);

    if (!userResult.length || !userResult[0].values.length) {
      await closeDatabase();
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND"
      });
    }

    const user = userResult[0].values[0];

    if (user[3] !== "active") {
      await closeDatabase();
      return res.status(403).json({
        success: false,
        error: "USER_NOT_ACTIVE"
      });
    }

    const roomId = `room_${require("crypto").randomUUID()}`;

    db.run(`
      INSERT INTO rooms (
        room_id,
        owner_user_id,
        name,
        description
      )
      VALUES (?, ?, ?, ?)
    `, [
      roomId,
      userId,
      name,
      description
    ]);

    saveDatabase();
    await closeDatabase();

    return res.status(201).json({
      success: true,
      room: {
        roomId,
        ownerUserId: userId,
        ownerName: user[2] || user[1],
        name,
        description,
        status: "active"
      }
    });
  } catch (error) {
    console.error("ROOM_CREATE_ERROR:", error.message);
    return res.status(500).json({
      success: false,
      error: "ROOM_CREATE_FAILED"
    });
  }
});

/* ===== USER ROOMS LIST API ===== */
app.get("/api/rooms", async (req, res) => {
  try {
    const userId = String(req.query?.userId || "").trim();

    const db = await openDatabase();

    let result;

    if (userId) {
      result = db.exec(`
        SELECT
          room_id,
          owner_user_id,
          name,
          description,
          status,
          created_at,
          updated_at
        FROM rooms
        WHERE owner_user_id = ?
        ORDER BY created_at DESC
      `, [userId]);
    } else {
      result = db.exec(`
        SELECT
          room_id,
          owner_user_id,
          name,
          description,
          status,
          created_at,
          updated_at
        FROM rooms
        WHERE status = 'active'
        ORDER BY created_at DESC
      `);
    }

    await closeDatabase();

    const rows = result.length ? result[0].values : [];

    return res.json({
      success: true,
      rooms: rows.map(row => ({
        roomId: row[0],
        ownerUserId: row[1],
        name: row[2],
        description: row[3],
        status: row[4],
        createdAt: row[5],
        updatedAt: row[6]
      }))
    });
  } catch (error) {
    console.error("ROOM_LIST_ERROR:", error.message);
    return res.status(500).json({
      success: false,
      error: "ROOM_LIST_FAILED"
    });
  }
});

/* ===== ROOM MANAGEMENT API ===== */
app.put("/api/rooms/:roomId", async (req, res) => {
  try {
    const roomId = String(req.params.roomId || "").trim();
    const userId = String(req.body?.userId || "").trim();
    const name =
      req.body?.name == null ? null : String(req.body.name).trim();
    const description =
      req.body?.description == null
        ? null
        : String(req.body.description).trim();

    if (!roomId) {
      return res.status(400).json({
        success: false,
        error: "ROOM_ID_REQUIRED"
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "USER_ID_REQUIRED"
      });
    }

    if (name !== null && (name.length < 2 || name.length > 100)) {
      return res.status(400).json({
        success: false,
        error: "ROOM_NAME_LENGTH_INVALID"
      });
    }

    const db = await openDatabase();

    const existing = db.exec(`
      SELECT room_id, owner_user_id, name, description, status
      FROM rooms
      WHERE room_id = ?
      LIMIT 1
    `, [roomId]);

    if (!existing.length || !existing[0].values.length) {
      await closeDatabase();
      return res.status(404).json({
        success: false,
        error: "ROOM_NOT_FOUND"
      });
    }

    const room = existing[0].values[0];

    if (room[1] !== userId) {
      await closeDatabase();
      return res.status(403).json({
        success: false,
        error: "ROOM_OWNER_REQUIRED"
      });
    }

    const nextName = name === null ? room[2] : name;
    const nextDescription =
      description === null ? room[3] : description;

    db.run(`
      UPDATE rooms
      SET
        name = ?,
        description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE room_id = ?
        AND owner_user_id = ?
    `, [
      nextName,
      nextDescription,
      roomId,
      userId
    ]);

    saveDatabase();
    await closeDatabase();

    return res.json({
      success: true,
      room: {
        roomId,
        ownerUserId: userId,
        name: nextName,
        description: nextDescription,
        status: room[4]
      }
    });
  } catch (error) {
    console.error("ROOM_UPDATE_ERROR:", error.message);
    return res.status(500).json({
      success: false,
      error: "ROOM_UPDATE_FAILED"
    });
  }
});

app.delete("/api/rooms/:roomId", async (req, res) => {
  try {
    const roomId = String(req.params.roomId || "").trim();
    const userId = String(req.body?.userId || "").trim();

    if (!roomId) {
      return res.status(400).json({
        success: false,
        error: "ROOM_ID_REQUIRED"
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "USER_ID_REQUIRED"
      });
    }

    const db = await openDatabase();

    const existing = db.exec(`
      SELECT room_id, owner_user_id, name
      FROM rooms
      WHERE room_id = ?
      LIMIT 1
    `, [roomId]);

    if (!existing.length || !existing[0].values.length) {
      await closeDatabase();
      return res.status(404).json({
        success: false,
        error: "ROOM_NOT_FOUND"
      });
    }

    const room = existing[0].values[0];

    if (room[1] !== userId) {
      await closeDatabase();
      return res.status(403).json({
        success: false,
        error: "ROOM_OWNER_REQUIRED"
      });
    }

    db.run(`
      UPDATE rooms
      SET
        status = 'deleted',
        updated_at = CURRENT_TIMESTAMP
      WHERE room_id = ?
        AND owner_user_id = ?
    `, [roomId, userId]);

    saveDatabase();
    await closeDatabase();

    return res.json({
      success: true,
      room: {
        roomId,
        name: room[2],
        status: "deleted"
      }
    });
  } catch (error) {
    console.error("ROOM_DELETE_ERROR:", error.message);
    return res.status(500).json({
      success: false,
      error: "ROOM_DELETE_FAILED"
    });
  }
});

/* ===== PLATFORM HEALTH ===== */
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        platform: "منصة البث",
        status: "running",
        rooms: rooms.size,
        realtime: true,
        socketio: true,
        webrtcSignaling: true,
        dataStore: "in-memory"
    });
});

function getRoom(roomId) {
    if (!rooms.has(roomId)) {
        const meta = getRoomMeta(roomId);

        rooms.set(roomId, {
            id: roomId,
            name: meta.name,
            featured: meta.featured,
            host: null,
            hostName: null,
            viewers: new Map(),
            live: false
        });
    }

    return rooms.get(roomId);
}

function roomState(room) {
    return {
        room: room.id,
        host: room.hostName,
        viewers: Array.from(room.viewers.values()),
        viewerCount: room.viewers.size,
        online: Boolean(room.host || room.viewers.size)
    };
}

function broadcastRoomState(room) {
    io.to(room.id).emit("room-state", roomState(room));
}

io.on("connection", socket => {

    console.log("SOCKET_CONNECTED:", socket.id);

    socket.emit("rooms-directory", roomsDirectoryState());

    socket.on("disconnect", reason => {
        console.log("SOCKET_DISCONNECTED:", socket.id, reason);
    });


    socket.on("join-room", ({ room, user, role }) => {
        console.log("JOIN_ROOM_RECEIVED:", {
            socketId: socket.id,
            room: room,
            user: user,
            role: role
        });

        room = String(room || "").trim();
        user = String(user || "").trim();
        role = role === "host" ? "host" : "viewer";

        if (!room) return;

        if (!user) {
            socket.emit("join-error", "يرجى إدخال اسم المستخدم أولاً.");
            return;
        }

        if (user.length > 50) {
            socket.emit("join-error", "اسم المستخدم يجب ألا يتجاوز 50 حرفًا.");
            return;
        }

        const data = getRoom(room);

        if (role === "host") {
            if (data.host && data.host !== socket.id) {
                socket.emit("join-error", "الغرفة لها مضيف بالفعل.");
                return;
            }

            data.host = socket.id;
            data.hostName = user;
            socket.role = "host";
        } else {
            data.viewers.set(socket.id, user);
            socket.role = "viewer";
        }

        socket.room = room;
        socket.user = user;

        socket.join(room);

        broadcastRoomState(data);
        broadcastRoomsDirectory();

        io.to(room).emit("system", {
            text: role === "host"
                ? `👑 ${user} بدأ البث`
                : `👋 ${user} دخل الغرفة`
        });

        broadcastRoomState(data);
    });

    // ===== WEBRTC SIGNALING BRIDGE =====

    socket.on("request-host", () => {
        console.log("WEBRTC_REQUEST_HOST:", {
            socketId: socket.id,
            room: socket.room,
            user: socket.user
        });
        if (!socket.room) return;

        const room = rooms.get(socket.room);
        if (!room || !room.host) return;

        console.log("WEBRTC_VIEWER_READY_SERVER:", {
            host: room.host,
            viewerId: socket.id,
            viewerName: socket.user || "مشاهد"
        });

        io.to(room.host).emit("viewer-ready", {
            viewerId: socket.id,
            viewerName: socket.user || "مشاهد"
        });
    });

    socket.on("webrtc-offer", data => {
        console.log("WEBRTC_OFFER_SERVER:", {
            from: socket.id,
            to: data?.to,
            hasOffer: !!data?.offer
        });
        if (!socket.room || !data || !data.to || !data.offer) return;

        io.to(data.to).emit("webrtc-offer", {
            from: socket.id,
            offer: data.offer
        });
    });

    socket.on("webrtc-answer", data => {
        console.log("WEBRTC_ANSWER_SERVER:", {
            from: socket.id,
            to: data?.to,
            hasAnswer: !!data?.answer
        });
        if (!socket.room || !data || !data.to || !data.answer) return;

        io.to(data.to).emit("webrtc-answer", {
            from: socket.id,
            answer: data.answer
        });
    });

    socket.on("webrtc-ice", data => {
        console.log("WEBRTC_ICE_SERVER:", {
            from: socket.id,
            to: data?.to,
            hasCandidate: !!data?.candidate
        });
        if (!socket.room || !data || !data.to || !data.candidate) return;

        io.to(data.to).emit("webrtc-ice", {
            from: socket.id,
            candidate: data.candidate
        });
    });

    // ===== END WEBRTC SIGNALING BRIDGE =====

    // ===== LIVE ACTIONS BRIDGE =====

    socket.on("start-broadcast", () => {
        if (!socket.room || socket.role !== "host") return;

        const room = rooms.get(socket.room);
        if (!room || room.host !== socket.id) return;

        room.live = true;

        io.to(socket.room).emit("broadcast-state", {
            live: true,
            host: room.hostName || socket.user || "المضيف"
        });

        broadcastRoomState(room);
        broadcastRoomsDirectory();

    // إعادة إرسال المشاهدين الموجودين بالفعل للمضيف
        const currentRoom = rooms.get(socket.room);
        if (currentRoom && currentRoom.viewers) {
            for (const [viewerId, viewerName] of currentRoom.viewers.entries()) {
                console.log("WEBRTC_VIEWER_READY_ON_BROADCAST:", {
                    host: socket.id,
                    viewerId,
                    viewerName
                });

                io.to(socket.id).emit("viewer-ready", {
                    viewerId,
                    viewerName: viewerName || "مشاهد"
                });
            }
        }
    });

    socket.on("stop-broadcast", () => {
        if (!socket.room || socket.role !== "host") return;

        const room = rooms.get(socket.room);
        if (!room || room.host !== socket.id) return;

        room.live = false;

        io.to(socket.room).emit("broadcast-state", {
            live: false,
            host: room.hostName || socket.user || "المضيف"
        });

        broadcastRoomState(room);
        broadcastRoomsDirectory();
    });

    socket.on("gift", gift => {
        if (!socket.room || !socket.user) return;

        const allowedGifts = new Set([
            "🌹 وردة",
            "💎 ماسة",
            "🚀 صاروخ"
        ]);

        const selectedGift = String(gift || "").trim();

        if (!allowedGifts.has(selectedGift)) return;

        io.to(socket.room).emit("gift", {
            user: socket.user,
            role: socket.role || "viewer",
            text: selectedGift,
            time: new Date().toISOString()
        });
    });

    // ===== END LIVE ACTIONS BRIDGE =====

    socket.on("chat", text => {
        if (!socket.room) return;

        const message = String(text || "").trim();
        if (!message) return;

        io.to(socket.room).emit("chat", {
            user: socket.user || "زائر",
            role: socket.role || "viewer",
            text: message,
            time: new Date().toISOString()
        });
    });

    socket.on("leave-room", () => {
        leaveRoom(socket);
    });

    socket.on("disconnect", () => {
        leaveRoom(socket);
    });
});

function leaveRoom(socket) {
    if (!socket.room) return;

    const roomId = socket.room;
    const room = rooms.get(roomId);

    if (!room) return;

    if (socket.role === "host" && room.host === socket.id) {
        room.host = null;
        room.hostName = null;

        io.to(roomId).emit("system", {
            text: `⛔ ${socket.user || "المستخدم"} غادر الغرفة`
        });
    }

    room.viewers.delete(socket.id);

    socket.leave(roomId);

    io.to(roomId).emit("system", {
        text: `🚪 ${socket.user || "زائر"} غادر الغرفة`
    });

    if (room.host || room.viewers.size) {
        broadcastRoomState(room);
    } else {
        rooms.delete(roomId);
    }

    broadcastRoomsDirectory();

    socket.room = null;
    socket.role = null;
}


// ===== MALIK CONSULTANT BRIDGE =====
app.get("/api/malik/health", async (req, res) => {
    const bridgeUrl =
        process.env.MALIK_BRIDGE_URL ||
        "http://127.0.0.1:3000/api/consultant/chat";

    res.json({
        success: true,
        service: "malik-consultant-bridge",
        configured: Boolean(process.env.MALIK_BRIDGE_URL),
        bridgeUrl: process.env.MALIK_BRIDGE_URL ? bridgeUrl : "local-default",
        status: process.env.MALIK_BRIDGE_URL ? "configured" : "local-fallback"
    });
});

app.post("/api/malik/chat", async (req, res) => {
    try {
        const message = String(req.body?.message || "").trim();

        if (!message) {
            return res.status(400).json({
                success: false,
                reply: "من فضلك اكتب سؤالك للمستشار مالك."
            });
        }

        const userId =
            String(req.body?.userId || "").trim() ||
            "lexbridge-local-user";

        const response = await fetch(
            process.env.MALIK_BRIDGE_URL ||
            "http://127.0.0.1:5050/api/free-consultation",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message,
                    userId
                })
            }
        );

        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = {
                success: false,
                reply: text
            };
        }

        res.status(response.status).json(data);

    } catch (error) {
        console.error("Malik bridge error:", error.message);

        res.status(503).json({
            success: false,
            reply: "خدمة المستشار مالك غير متاحة حالياً."
        });
    }
});

// ===== END MALIK CONSULTANT BRIDGE =====

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
    console.log("🚀 LIVE PLATFORM");
    console.log("✅ Real rooms enabled");
    console.log("👑 Hosts + 👥 Viewers + 🔢 Live counters");
    console.log(`🌐 http://${HOST}:${PORT}`);
});
