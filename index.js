require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { body, validationResult } = require("express-validator");

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

// Error logging helper
const logError = (context, error, additionalInfo = {}) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR in ${context}:`, {
    message: error.message,
    stack: error.stack,
    ...additionalInfo
  });
};

// Input validation middleware
const validateInput = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
      value: err.value
    }));
    
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      details: errorMessages
    });
  }
  next();
};

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
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    
    const payload = { 
      userId: user._id,
      email: user.email,
      name: user.name
    };
    
    console.log(`[${new Date().toISOString()}] Generating token for user: ${user.email}`);
    
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log(`[${new Date().toISOString()}] Token generated successfully for user: ${user.email}`);
    return token;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error generating JWT token:`, {
      message: error.message,
      stack: error.stack,
      userEmail: user?.email
    });
    throw error;
  }
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
app.post("/auth/signup", [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address'),
  body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be between 6 and 128 characters')
], validateInput, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    console.log(`[${new Date().toISOString()}] Signup attempt for email: ${email}`);

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`[${new Date().toISOString()}] Signup failed - User already exists: ${email}`);
      return res.status(409).json({ 
        status: "error", 
        message: "An account with this email address already exists. Please try logging in instead.",
        code: "USER_EXISTS"
      });
    }

    // Create new user
    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase(),
      password
    });

    console.log(`[${new Date().toISOString()}] User created successfully: ${email}`);

    // Generate JWT token
    const token = generateToken(newUser);

    return res.status(201).json({ 
      status: "success", 
      message: "Account created successfully! You are now logged in.",
      code: "USER_CREATED",
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email
      }
    });
  } catch (error) {
    logError('signup', error, { email: req.body?.email });
    
    if (error.code === 11000) {
      return res.status(409).json({ 
        status: "error", 
        message: "An account with this email address already exists.",
        code: "DUPLICATE_EMAIL"
      });
    }
    
    return res.status(500).json({ 
      status: "error", 
      message: "We're experiencing technical difficulties. Please try again later.",
      code: "SIGNUP_FAILED"
    });
  }
});

app.post("/auth/login", [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address'),
  body('password').isLength({ min: 1 }).withMessage('Password is required')
], validateInput, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const requestId = uuidv4().substring(0, 8);
    console.log(`[${new Date().toISOString()}] [${requestId}] Login attempt for email: ${email}`);
    
    // First check if user exists by email
    const userByEmail = await User.findOne({ email: email.toLowerCase() });
    
    if (!userByEmail) {
      console.log(`[${new Date().toISOString()}] [${requestId}] Login failed - User not found: ${email}`);
      return res.status(401).json({ 
        status: "error", 
        message: "No account found with this email address. Please check your email or sign up for a new account.",
        code: "USER_NOT_FOUND",
        requestId
      });
    }
    
    console.log(`[${new Date().toISOString()}] [${requestId}] User found, checking password...`);
    console.log(`[${new Date().toISOString()}] [${requestId}] Stored password: "${userByEmail.password}", Provided password: "${password}"`);
    
    // Check password match
    if (userByEmail.password !== password) {
      console.log(`[${new Date().toISOString()}] [${requestId}] Login failed - Password mismatch for: ${email}`);
      return res.status(401).json({ 
        status: "error", 
        message: "Incorrect password. Please check your password and try again.",
        code: "INVALID_PASSWORD",
        requestId
      });
    }
    
    console.log(`[${new Date().toISOString()}] [${requestId}] Login successful for: ${email}`);
    
    // Generate JWT token with specific error handling
    let token;
    try {
      token = generateToken(userByEmail);
      console.log(`[${new Date().toISOString()}] [${requestId}] JWT token generated successfully`);
    } catch (tokenError) {
      console.error(`[${new Date().toISOString()}] [${requestId}] JWT token generation failed:`, tokenError);
      return res.status(500).json({ 
        status: "error", 
        message: "Authentication successful but token generation failed. Please try again.",
        code: "TOKEN_GENERATION_FAILED",
        requestId
      });
    }
    
    // Prepare user response data
    let responseData;
    try {
      responseData = {
        id: userByEmail._id,
        name: userByEmail.name,
        email: userByEmail.email
      };
      console.log(`[${new Date().toISOString()}] [${requestId}] Response data prepared successfully`);
    } catch (dataError) {
      console.error(`[${new Date().toISOString()}] [${requestId}] Error preparing response data:`, dataError);
      return res.status(500).json({ 
        status: "error", 
        message: "Authentication successful but response preparation failed. Please try again.",
        code: "RESPONSE_PREPARATION_FAILED",
        requestId
      });
    }
    
    console.log(`[${new Date().toISOString()}] [${requestId}] Sending successful login response`);
    
    return res.json({ 
      status: "success", 
      message: "Login successful! Welcome back.",
      code: "LOGIN_SUCCESS",
      token,
      user: responseData,
      requestId
    });
    
  } catch (error) {
    const requestId = uuidv4().substring(0, 8);
    logError('login', error, { 
      email: req.body?.email,
      requestId
    });
    
    return res.status(500).json({ 
      status: "error", 
      message: "We're experiencing technical difficulties. Please try again later.",
      code: "LOGIN_FAILED",
      requestId
    });
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
