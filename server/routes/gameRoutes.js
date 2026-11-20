
const express = require("express");
const DailyProgress = require("../models/DailyProgress");
const protect = require("../middleware/auth");

const {
  getDailyPuzzle,
  getPacificDateKey
} = require("../services/dailyPuzzleService");

const {
  validatePartialPath,
  validateCompletedPath,
  canCompletePath
} = require("../services/gameLogic");

const {
  toPublicPuzzle
} = require("../services/puzzleResponse");

const router = express.Router();

const MODES = ["Easy", "Medium", "Hard", "Challenge"];
const POINTS_PER_CELL = 10;
function calculateChallengeResult(path, verifiedSolutions) {
  let correctCells = 0;

  for (const solution of verifiedSolutions || []) {
    let solutionCorrectCells = 0;

    for (let i = 0; i < path.length && i < solution.length; i++) {
      if (path[i] !== solution[i]) {
        break;
      }

      solutionCorrectCells++;
    }

    correctCells = Math.max(correctCells, solutionCorrectCells);
  }

  const incorrectCells = Math.max(0, path.length - correctCells);

  return {
    correctCells,
    incorrectCells,
    score: correctCells * POINTS_PER_CELL
  };
}

function isValidMode(mode) {
  return MODES.includes(mode);
}

function validateElapsed(seconds) {
  return (
    Number.isInteger(seconds) &&
    seconds >= 0 &&
    seconds <= 86400
  );
}

function getElapsedSeconds(modeProgress) {
  if (!modeProgress.startedAt) return 0;

  return Math.min(
    86400,
    Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(modeProgress.startedAt).getTime()) / 1000
      )
    )
  );
}

async function getTodayProgress(userId) {
  const dateKey = getPacificDateKey();

  try {
    return await DailyProgress.findOneAndUpdate(
      { user: userId, dateKey },
      {
        $setOnInsert: {
          user: userId,
          dateKey
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );
  } catch (error) {
    if (error.code === 11000) {
      return DailyProgress.findOne({ user: userId, dateKey });
    }
    throw error;
  }
}

async function loadPuzzle(mode) {
  return getDailyPuzzle(mode);
}

// GET TODAY'S PROGRESS
router.get("/today", protect, async (req, res) => {
  try {
    const progress = await getTodayProgress(req.user._id);

    return res.json({
      success: true,
      dateKey: progress.dateKey,
      modes: progress.modes
    });
  } catch (error) {
    console.error("Daily progress error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load daily progress."
    });
  }
});

// GET OFFICIAL DAILY PUZZLE
router.get("/puzzle/:mode", protect, async (req, res) => {
  try {
    const { mode } = req.params;

    if (!isValidMode(mode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid game mode."
      });
    }

    const puzzle = await loadPuzzle(mode);

    return res.json({
      success: true,
      puzzle: toPublicPuzzle(puzzle)
    });
  } catch (error) {
    console.error("Puzzle loading error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode === 503
        ? error.message
        : "Unable to load today's puzzle."
    });
  }
});

// START OR RESUME A MODE
router.post("/start", protect, async (req, res) => {
  try {
    const { mode } = req.body;

    if (!isValidMode(mode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid game mode."
      });
    }

    const puzzle = await loadPuzzle(mode);
    const progress = await getTodayProgress(req.user._id);
    let modeProgress = progress.modes[mode];

    if (modeProgress.status === "completed") {
      return res.status(403).json({
        success: false,
        locked: true,
        message: `${mode} is already completed today.`
      });
    }

    if (
      mode === "Challenge" &&
      modeProgress.attempts >= 1 &&
      modeProgress.status !== "in_progress"
    ) {
      return res.status(403).json({
        success: false,
        locked: true,
        message: "Your Daily Challenge attempt has already been used. Come back tomorrow!"
      });
    }

    if (modeProgress.status === "in_progress") {
      return res.json({
        success: true,
        resumed: true,
        puzzle: toPublicPuzzle(puzzle),
        modeProgress
      });
    }

    // Atomically claim an available attempt.
    // This prevents two simultaneous requests from starting twice.
    const field = `modes.${mode}.status`;

    const updated = await DailyProgress.findOneAndUpdate(
      {
        _id: progress._id,
        [field]: { $in: ["available", "failed"] },
        ...(mode === "Challenge"
          ? { "modes.Challenge.attempts": { $lt: 1 } }
          : {})
      },
      {
        $inc: { [`modes.${mode}.attempts`]: 1 },
        $set: {
          [field]: "in_progress",
          [`modes.${mode}.currentPath`]: [],
          [`modes.${mode}.elapsedSeconds`]: 0,
          [`modes.${mode}.startedAt`]: new Date(),
          [`modes.${mode}.completedAt`]: null,
          [`modes.${mode}.lastScore`]: 0
        }
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "This mode has already been started or used. Refresh your progress."
      });
    }

    return res.json({
      success: true,
      resumed: false,
      puzzle: toPublicPuzzle(puzzle),
      modeProgress: updated.modes[mode],
      message: `${mode} attempt started.`
    });
  } catch (error) {
    console.error("Start game error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode === 503
        ? error.message
        : "Unable to start the game."
    });
  }
});

// SAVE A LEGAL PARTIAL PATH
router.put("/save", protect, async (req, res) => {
  try {
    const { mode, path, elapsedSeconds } = req.body;

    if (!isValidMode(mode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid game mode."
      });
    }

    if (!Array.isArray(path) || !validateElapsed(elapsedSeconds)) {
      return res.status(400).json({
        success: false,
        message: "Invalid game progress."
      });
    }

    const puzzle = await loadPuzzle(mode);
    const validation = validatePartialPath(path, puzzle);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Keep thinking. This path cannot be saved."
      });
    }

    const progress = await getTodayProgress(req.user._id);
    const modeProgress = progress.modes[mode];

    if (modeProgress.status !== "in_progress") {
      return res.status(403).json({
        success: false,
        message: "There is no active attempt."
      });
    }

    const serverElapsed = getElapsedSeconds(modeProgress);

    modeProgress.currentPath = path;
    modeProgress.elapsedSeconds = serverElapsed;

    await progress.save();

    return res.json({
      success: true,
      message: "Game progress saved.",
      elapsedSeconds: serverElapsed
    });
  } catch (error) {
    console.error("Save progress error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: "Unable to save game progress."
    });
  }
});

// RECORD A VERIFIED FAILED ATTEMPT
router.post("/fail", protect, async (req, res) => {
  try {
    const { mode, path, elapsedSeconds } = req.body;

    if (!isValidMode(mode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid game mode."
      });
    }

    if (!Array.isArray(path) || !validateElapsed(elapsedSeconds)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attempt information."
      });
    }

    const puzzle = await loadPuzzle(mode);
    const validation = validatePartialPath(path, puzzle);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Invalid route."
      });
    }

    const canFinish = canCompletePath(path, puzzle);

    if (canFinish === null) {
      return res.status(503).json({
        success: false,
        message: "The server could not verify this result. Please try again."
      });
    }

    if (canFinish === true) {
      return res.status(409).json({
        success: false,
        message: "This route may still be completed."
      });
    }

    const progress = await getTodayProgress(req.user._id);
    const modeProgress = progress.modes[mode];

    if (modeProgress.status !== "in_progress") {
      return res.status(403).json({
        success: false,
        message: "No active attempt was found."
      });
    }

    const serverElapsed = getElapsedSeconds(modeProgress);

    const challengeResult = mode === "Challenge"
      ? calculateChallengeResult(path, puzzle.verifiedSolutions)
      : null;
    const partialScore = challengeResult
      ? challengeResult.score
      : 0;

    modeProgress.lastScore = partialScore;
    modeProgress.bestScore = Math.max(
      modeProgress.bestScore,
      partialScore
    );
    modeProgress.currentPath = path;
    modeProgress.elapsedSeconds = serverElapsed;

    if (mode === "Challenge") {
      modeProgress.status = "failed";
      modeProgress.completedAt = new Date();
    } else {
      modeProgress.status = "available";
      modeProgress.currentPath = [];
      modeProgress.elapsedSeconds = 0;
      modeProgress.startedAt = null;
    }

    await progress.save();

    return res.json({
      success: true,
      score: partialScore,
      correctCells: challengeResult?.correctCells,
      incorrectCells: challengeResult?.incorrectCells,
      locked: mode === "Challenge",
      message: mode === "Challenge"
        ? "Daily Challenge attempt recorded."
        : "Practice attempt recorded. You can try again."
    });
  } catch (error) {
    console.error("Failed attempt error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: "Unable to record the attempt."
    });
  }
});

// RECORD A VERIFIED COMPLETION
router.post("/complete", protect, async (req, res) => {
  try {
    const {
      mode,
      path,
      elapsedSeconds,
      bombsSelected = 0
    } = req.body;

    if (!isValidMode(mode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid game mode."
      });
    }

    if (!Array.isArray(path) || !validateElapsed(elapsedSeconds)) {
      return res.status(400).json({
        success: false,
        message: "Invalid completion information."
      });
    }

    const puzzle = await loadPuzzle(mode);
    const validation = validateCompletedPath(path, puzzle);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Keep thinking. This route is not complete."
      });
    }

    const progress = await getTodayProgress(req.user._id);
    const modeProgress = progress.modes[mode];

    if (modeProgress.status !== "in_progress") {
      return res.status(403).json({
        success: false,
        message: "No active attempt was found."
      });
    }

    const serverElapsed = getElapsedSeconds(modeProgress);

    if (
      !Number.isInteger(bombsSelected) ||
      bombsSelected < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid bomb information."
      });
    }

    const timeScore = Math.max(
      100,
      1000 - serverElapsed * 5
    );
    const bombPenalty = mode === "Challenge"
      ? bombsSelected * POINTS_PER_CELL
      : 0;
    const completionScore = mode === "Challenge"
      ? Math.max(0, timeScore - bombPenalty)
      : timeScore;

    modeProgress.status = "completed";
    modeProgress.currentPath = path;
    modeProgress.elapsedSeconds = serverElapsed;
    modeProgress.completionTime = serverElapsed;
    modeProgress.completedAt = new Date();
    modeProgress.lastScore = completionScore;
    modeProgress.bestScore = Math.max(
      modeProgress.bestScore,
      completionScore
    );

    await progress.save();

    return res.json({
      success: true,
      locked: true,
      score: completionScore,
      correctCells: mode === "Challenge" ? puzzle.totalPlayable : undefined,
      bombsSelected: mode === "Challenge" ? bombsSelected : undefined,
      bombPenalty: mode === "Challenge" ? bombPenalty : undefined,
      completionTime: serverElapsed,
      message: `${mode} completed successfully!`
    });
  } catch (error) {
    console.error("Completion error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: "Unable to record completion."
    });
  }
});

module.exports = router;
