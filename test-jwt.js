require("dotenv").config();

console.log("Environment check:");
console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);
console.log("JWT_SECRET length:", process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0);
console.log("MONGO_URI exists:", !!process.env.MONGO_URI);

// Test JWT generation
const jwt = require("jsonwebtoken");

const testUser = {
  _id: "test123",
  name: "Test User", 
  email: "test@example.com"
};

try {
  const token = jwt.sign(
    { 
      userId: testUser._id,
      email: testUser.email,
      name: testUser.name
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  console.log("JWT generation test: SUCCESS");
  console.log("Token generated:", token.substring(0, 50) + "...");
  
  // Test token verification
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log("JWT verification test: SUCCESS");
  console.log("Decoded payload:", decoded);
  
} catch (error) {
  console.error("JWT test FAILED:", error.message);
}