const express = require('express');
const auth = require('../middleware/auth');
const ResumeRepo = require('../models/ResumeRepo');
const ResumeVersion = require('../models/ResumeVersion');
const { compareJSON } = require('../services/diffEngine');

const router = express.Router();

// Get all repos for the user
router.get('/', auth, async (req, res) => {
  try {
    const repos = await ResumeRepo.find({ userId: req.user }).sort({ createdAt: -1 });
    res.json(repos);
  } catch(err) {
    res.status(500).send('Server Error');
  }
});

// Create a new repo (main or branch)
router.post('/', auth, async (req, res) => {
  try {
    const { repoName, baseRepoId } = req.body;
    const repo = new ResumeRepo({
      userId: req.user,
      repoName,
      baseRepoId: baseRepoId || null
    });
    await repo.save();

    // If it's a branch, copy the latest commit from baseRepo to the new branch
    if (baseRepoId) {
      const latestBaseCommit = await ResumeVersion.findOne({ repoId: baseRepoId }).sort({ versionNumber: -1 });
      if (latestBaseCommit) {
        const initialCommit = new ResumeVersion({
          repoId: repo._id,
          versionNumber: 1,
          parentVersionNumber: null,
          commitMessage: `[BRANCH] Forked from latest target base`,
          resumeData: latestBaseCommit.resumeData,
          changes: []
        });
        await initialCommit.save();
      }
    } else {
      // It's a main repo, create empty initialize commit
      const initialCommit = new ResumeVersion({
        repoId: repo._id,
        versionNumber: 1,
        parentVersionNumber: null,
        commitMessage: 'Initial Zero Commit',
        resumeData: {
          name: "", email: "", skills: [], experience: [], projects: []
        },
        changes: []
      });
      await initialCommit.save();
    }

    res.json(repo);
  } catch(err) {
    res.status(500).send('Server Error');
  }
});

// Fork a repository (works for main repos AND already-forked repos)
router.post('/:repoId/fork', auth, async (req, res) => {
  try {
    const sourceRepo = await ResumeRepo.findOne({ _id: req.params.repoId, userId: req.user });
    if (!sourceRepo) return res.status(404).json({ message: 'Source repository not found' });

    const { repoName } = req.body;
    const forkName = repoName || `${sourceRepo.repoName}-fork`;

    const fork = new ResumeRepo({
      userId: req.user,
      repoName: forkName,
      baseRepoId: sourceRepo._id
    });
    await fork.save();

    const latestCommit = await ResumeVersion.findOne({ repoId: sourceRepo._id }).sort({ versionNumber: -1 });
    if (latestCommit) {
      const initialCommit = new ResumeVersion({
        repoId: fork._id,
        versionNumber: 1,
        parentVersionNumber: null,
        commitMessage: `[FORK] Forked from ${sourceRepo.repoName}`,
        resumeData: latestCommit.resumeData,
        changes: []
      });
      await initialCommit.save();
    }

    res.json(fork);
  } catch(err) {
    res.status(500).send('Server Error');
  }
});

// Get all forks of a repository
router.get('/:repoId/forks', auth, async (req, res) => {
  try {
    const forks = await ResumeRepo.find({ baseRepoId: req.params.repoId, userId: req.user }).sort({ createdAt: -1 });
    res.json(forks);
  } catch(err) {
    res.status(500).send('Server Error');
  }
});

// Delete a repository
router.delete('/:repoId', auth, async (req, res) => {
  try {
    const repo = await ResumeRepo.findOne({ _id: req.params.repoId, userId: req.user });
    if (!repo) return res.status(404).json({ message: 'Repository not found' });
    
    // Delete associated versions explicitly
    await ResumeVersion.deleteMany({ repoId: repo._id });
    // Delete repo
    await ResumeRepo.deleteOne({ _id: repo._id });
    
    res.json({ message: 'Repository terminal deleted successfully.' });
  } catch(err) {
    res.status(500).send('Server Error');
  }
});

// Merge branch into its base
router.post('/:repoId/merge', auth, async (req, res) => {
  try {
    const branchRepo = await ResumeRepo.findOne({ _id: req.params.repoId, userId: req.user });
    if (!branchRepo || !branchRepo.baseRepoId) {
      return res.status(400).json({ message: 'Invalid branch repository' });
    }

    // Get latest from branch
    const branchLatest = await ResumeVersion.findOne({ repoId: branchRepo._id }).sort({ versionNumber: -1 });
    if (!branchLatest) return res.status(400).json({ message: 'No commits in branch' });

    // Target the main repo natively
    const baseLatest = await ResumeVersion.findOne({ repoId: branchRepo.baseRepoId }).sort({ versionNumber: -1 });
    
    let versionNumber = 1;
    let parentVersionNumber = null;
    let changes = [];

    if (baseLatest) {
      versionNumber = baseLatest.versionNumber + 1;
      parentVersionNumber = baseLatest.versionNumber;
      changes = compareJSON(baseLatest.resumeData, branchLatest.resumeData);
    }

    // Create a MERGE commit onto the base parent natively!
    const mergeCommit = new ResumeVersion({
      repoId: branchRepo.baseRepoId,
      versionNumber,
      parentVersionNumber,
      commitMessage: `[MERGE] Merged ${branchRepo.repoName} resolving incoming timeline`,
      resumeData: branchLatest.resumeData,
      changes
    });

    await mergeCommit.save();
    res.json({ message: 'Merge successful', commit: mergeCommit });
  } catch(err) {
    res.status(500).send('Server Error');
  }
});

// Get commits for a repo
router.get('/:repoId/commits', auth, async (req, res) => {
  try {
    const commits = await ResumeVersion.find({ repoId: req.params.repoId }).sort({ versionNumber: -1 });
    res.json(commits);
  } catch(err) {
    res.status(500).send('Server Error');
  }
});

// Create a commit
router.post('/:repoId/commits', auth, async (req, res) => {
  try {
    const { commitMessage, resumeData } = req.body;
    const repoId = req.params.repoId;

    const latestCommit = await ResumeVersion.findOne({ repoId }).sort({ versionNumber: -1 });
    
    let changes = [];
    let versionNumber = 1;
    let parentVersionNumber = null;

    if (latestCommit) {
      versionNumber = latestCommit.versionNumber + 1;
      parentVersionNumber = latestCommit.versionNumber;
      changes = compareJSON(latestCommit.resumeData, resumeData);
    }

    const newCommit = new ResumeVersion({
      repoId,
      versionNumber,
      parentVersionNumber,
      commitMessage,
      resumeData,
      changes
    });

    await newCommit.save();
    res.json(newCommit);
  } catch(err) {
    res.status(500).send('Server Error');
  }
});

// Update repository performance notes
router.put('/:repoId/notes', auth, async (req, res) => {
  try {
    const { notes } = req.body;
    const repo = await ResumeRepo.findOneAndUpdate(
      { _id: req.params.repoId, userId: req.user },
      { notes },
      { new: true }
    );
    if (!repo) return res.status(404).json({ message: 'Repository not found' });
    res.json(repo);
  } catch(err) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;
