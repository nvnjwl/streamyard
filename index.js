require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const app = express();

// CORS configuration
const corsOptions = {
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200 // Support legacy browsers
};

app.use(cors(corsOptions));
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

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Room = mongoose.model("Room", roomSchema);
const User = mongoose.model("User", userSchema);

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

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ status: "error", message: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ status: "error", message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// Helper function to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user._id,
      email: user.email,
      name: user.name
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Health check route
app.get("/health", async (req, res) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    
    return res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: dbStatus,
      service: "StreamYard Discovery Backend",
      version: "1.0.1"
    });
  } catch (error) {
    return res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      database: "error",
      service: "StreamYard Discovery Backend",
      version: "1.0.1"
    });
  }
});

// Auth routes
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ status: "error", message: "name, email and password are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ status: "error", message: "USER_EXISTS" });
    }

    // Create new user
    const newUser = await User.create({
      name,
      email,
      password
    });

    // Generate JWT token
    const token = generateToken(newUser);

    return res.json({ 
      status: "ok", 
      message: "USER_CREATED",
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email
      }
    });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "failed to create user" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ status: "error", message: "email and password are required" });
    }

    // Check if user exists with matching email and password
    const user = await User.findOne({ email, password });
    if (user) {
      // Generate JWT token
      const token = generateToken(user);
      
      return res.json({ 
        status: "ok", 
        message: "LOGIN_OK",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      });
    }

    return res.json({ status: "error", message: "INVALID_CREDENTIALS" });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "failed to login" });
  }
});

app.post("/room", authenticateToken, async (req, res) => {
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

app.post("/room/:id/join", authenticateToken, async (req, res) => {
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

app.get("/room/:id", authenticateToken, async (req, res) => {
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

app.post("/room/:id/start", authenticateToken, async (req, res) => {
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

app.post("/room/:id/stop", authenticateToken, async (req, res) => {
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
