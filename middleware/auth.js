const admin = require('firebase-admin');
const User = require('../models/User');

// Initialize Firebase Admin for ID token verification
// Project ID is sufficient to verify tokens locally against Google's public keys
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'resumevvc'
  });
}

const resolveUserFromToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify Firebase ID Token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email; // Optional

    let user = await User.findOne({ firebaseUid });
    if (!user) {
      user = new User({ firebaseUid, email });
      await user.save();
    }
    
    req.user = user._id; // Attach internal mongo ID
    next();
  } catch (err) {
    console.error('Auth Error:', err);
    res.status(401).json({ message: 'Invalid Firebase token or authentication failed' });
  }
};

module.exports = resolveUserFromToken;
