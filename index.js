require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

const { Schema } = mongoose;

const roomSchema = new Schema({
  roomId: { type: String, unique: true, index: true },
  title: { type: String, required: true },
  hostId: { type: String, required: true },
  guestIds: { type: [String], default: [] },
  webrtcRoomId: { type: String, required: true },
  hlsPlaybackUrl: { type: String, required: true },
  chatChannelId: { type: String, required: true },
  status: {
    type: String,
    enum: ["created", "live", "ended"],
    default: "created"
  },
  createdAt: { type: Date, default: Date.now }
});

const Room = mongoose.model("Room", roomSchema);

const MAX_GUESTS = 10;

const buildMockHlsUrl = (roomId) =>
  `https://example.com/hls/${roomId}/index.m3u8`;

const buildJoinResponse = (room, role) => ({
  role,
  roomId: room.roomId,
  webrtcRoomId: room.webrtcRoomId,
  hlsUrl: room.hlsPlaybackUrl,
  chatRoomId: room.chatChannelId
});

app.post("/room", async (req, res) => {
  try {
    const { title, hostId, hlsPlaybackUrl } = req.body;
    if (!title || !hostId) {
      return res.status(400).json({ error: "title and hostId are required" });
    }

    const roomId = uuidv4();
    const room = await Room.create({
      roomId,
      title,
      hostId,
      guestIds: [],
      webrtcRoomId: `webrtc-${uuidv4()}`,
      hlsPlaybackUrl: hlsPlaybackUrl || buildMockHlsUrl(roomId),
      chatChannelId: `chat-${uuidv4()}`,
      status: "created"
    });

    return res.status(201).json({
      roomId: room.roomId,
      title: room.title,
      hostId: room.hostId,
      webrtcRoomId: room.webrtcRoomId,
      hlsPlaybackUrl: room.hlsPlaybackUrl,
      chatChannelId: room.chatChannelId,
      status: room.status,
      createdAt: room.createdAt
    });
  } catch (error) {
    return res.status(500).json({ error: "failed to create room" });
  }
});

app.post("/room/:id/join", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const room = await Room.findOne({ roomId: req.params.id });
    if (!room) {
      return res.status(404).json({ error: "room not found" });
    }

    if (room.hostId === userId) {
      return res.json(buildJoinResponse(room, "host"));
    }

    if (room.guestIds.includes(userId)) {
      return res.json(buildJoinResponse(room, "guest"));
    }

    if (room.guestIds.length < MAX_GUESTS) {
      room.guestIds.push(userId);
      await room.save();
      return res.json(buildJoinResponse(room, "guest"));
    }

    return res.json(buildJoinResponse(room, "audience"));
  } catch (error) {
    return res.status(500).json({ error: "failed to join room" });
  }
});

app.get("/room/:id", async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.id }).lean();
    if (!room) {
      return res.status(404).json({ error: "room not found" });
    }

    return res.json({
      roomId: room.roomId,
      title: room.title,
      hostId: room.hostId,
      webrtcRoomId: room.webrtcRoomId,
      hlsPlaybackUrl: room.hlsPlaybackUrl,
      chatChannelId: room.chatChannelId,
      status: room.status,
      createdAt: room.createdAt
    });
  } catch (error) {
    return res.status(500).json({ error: "failed to fetch room" });
  }
});

app.post("/room/:id/start", async (req, res) => {
  try {
    const room = await Room.findOneAndUpdate(
      { roomId: req.params.id },
      { status: "live" },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ error: "room not found" });
    }

    return res.json({ roomId: room.roomId, status: room.status });
  } catch (error) {
    return res.status(500).json({ error: "failed to start room" });
  }
});

app.post("/room/:id/stop", async (req, res) => {
  try {
    const room = await Room.findOneAndUpdate(
      { roomId: req.params.id },
      { status: "ended" },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ error: "room not found" });
    }

    return res.json({ roomId: room.roomId, status: room.status });
  } catch (error) {
    return res.status(500).json({ error: "failed to stop room" });
  }
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("Missing MONGO_URI environment variable");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Discovery backend running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });
