const mongoose = require('mongoose');

const ResumeVersionSchema = new mongoose.Schema({
  repoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ResumeRepo',
    required: true
  },
  versionNumber: {
    type: Number,
    required: true
  },
  parentVersionNumber: {
    type: Number,
    default: null // null for the initial commit
  },
  commitMessage: {
    type: String,
    required: true
  },
  resumeData: {
    type: Object, // The full JSON structure
    required: true
  },
  changes: {
    type: Array, // Array of diff objects
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.model('ResumeVersion', ResumeVersionSchema);
