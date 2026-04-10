const mongoose = require('mongoose');

const ResumeRepoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  repoName: {
    type: String, // e.g., "main", "Google-SWE"
    required: true
  },
  baseRepoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ResumeRepo',
    default: null // null if it's the main repo
  },
  notes: {
    type: String,
    default: ""
  }
}, { timestamps: true });

module.exports = mongoose.model('ResumeRepo', ResumeRepoSchema);
