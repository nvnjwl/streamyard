require("dotenv").config();
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

async function testAuthLogic() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const testEmail = "nvnjwl@gmail.com";
    const testPassword = "naveen9291";
    
    console.log(`Testing authentication logic for: ${testEmail}`);
    
    // Find user by email
    const userByEmail = await User.findOne({ email: testEmail.toLowerCase() });
    
    if (!userByEmail) {
      console.log('❌ User not found by email');
      return;
    }
    
    console.log('✅ User found by email:', {
      name: userByEmail.name,
      email: userByEmail.email,
      storedPassword: userByEmail.password
    });
    
    // Test password comparison
    if (userByEmail.password !== testPassword) {
      console.log(`❌ Password mismatch: stored="${userByEmail.password}" vs provided="${testPassword}"`);
      return;
    }
    
    console.log('✅ Password matches!');
    console.log('✅ Authentication logic should work correctly');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

testAuthLogic();