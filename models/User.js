const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
