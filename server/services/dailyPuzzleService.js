
const DailyPuzzle = require("../models/DailyPuzzle");
const DailyProgress = require("../models/DailyProgress");
const {
  verifyPuzzleIntegrity
} = require("./puzzleIntegrity");
const {
  getPreviousDateKeys
} = require("./dateKey");
const {
  getPuzzleFingerprint
} = require("./puzzleFingerprint");
const {
  UNIQUENESS_DAYS,
  getPreviousPuzzleFingerprints
} = require("./puzzleHistory");
const {
  generateDailyPuzzle
} = require("../generators/puzzleGenerator");

const dailyPuzzleRequests = new Map();

function getPacificDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

async function getDailyPuzzle(mode, userId) {
  if (!Object.prototype.hasOwnProperty.call(UNIQUENESS_DAYS, mode)) {
    const error = new Error("Invalid game mode.");
    error.statusCode = 400;
    throw error;
  }

  const dateKey = getPacificDateKey();
  const requestKey = `${dateKey}:${mode}:${userId || "system"}`;
  let request = dailyPuzzleRequests.get(requestKey);

  if (!request) {
    request = ensureDailyPuzzleForDate(mode, dateKey, userId);
    dailyPuzzleRequests.set(requestKey, request);
  }

  try {
    return await request;
  } finally {
    if (dailyPuzzleRequests.get(requestKey) === request) {
      dailyPuzzleRequests.delete(requestKey);
    }
  }
}

async function ensureDailyPuzzleForDate(mode, dateKey, userId) {
  if (!Object.prototype.hasOwnProperty.call(UNIQUENESS_DAYS, mode)) {
    const error = new Error("Invalid game mode.");
    error.statusCode = 400;
    throw error;
  }

  const previousDateKeys = getPreviousDateKeys(
    dateKey,
    UNIQUENESS_DAYS[mode]
  );
  const previousPuzzles = await DailyPuzzle.find({
    mode,
    dateKey: { $in: previousDateKeys },
    verified: true
  }).select("+verifiedSolutions");
  const excludedFingerprints = getPreviousPuzzleFingerprints(
    mode,
    dateKey,
    previousPuzzles
  );

  let puzzle = await DailyPuzzle.findOne({ dateKey, mode })
    .select("+verifiedSolutions");

  if (!puzzle) {
    const generatedPuzzle = generateDailyPuzzle(mode, dateKey, {
      excludedFingerprints
    });

    try {
      puzzle = await DailyPuzzle.create(generatedPuzzle);
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }

      puzzle = await DailyPuzzle.findOne({ dateKey, mode })
        .select("+verifiedSolutions");

      if (!puzzle) {
        throw error;
      }
    }
  }

  for (let repairAttempt = 0; repairAttempt < 3; repairAttempt++) {
    const integrity = verifyPuzzleIntegrity(puzzle);

    if (!integrity.valid) {
      console.error(
        `Puzzle integrity failure (${mode}, ${dateKey}):`,
        integrity.reason
      );

      const error = new Error("Today's puzzle is temporarily unavailable.");
      error.statusCode = 503;
      throw error;
    }

    if (!excludedFingerprints.has(getPuzzleFingerprint(puzzle))) {
      return puzzle;
    }

    const progressFilter = {
      dateKey,
      [`modes.${mode}.attempts`]: { $gt: 0 }
    };
    const existingProgress = await DailyProgress.exists(progressFilter);

    if (existingProgress) {
      const userHasProgress = userId
        ? await DailyProgress.exists({
          ...progressFilter,
          user: userId
        })
        : false;

      if (userHasProgress) {
        console.warn(
          `Keeping duplicate ${mode} puzzle for ${dateKey} so an existing attempt can continue.`
        );
        return puzzle;
      }

      const error = new Error(
        "Today's puzzle has existing attempts and cannot be safely replaced."
      );
      error.statusCode = 503;
      throw error;
    }

    const replacement = generateDailyPuzzle(mode, dateKey, {
      excludedFingerprints
    });
    const updateFilter = { _id: puzzle._id };
    const versionKey = DailyPuzzle.schema.options.versionKey;

    if (puzzle.updatedAt) {
      updateFilter.updatedAt = puzzle.updatedAt;
    }

    if (versionKey) {
      const version = puzzle[versionKey];
      updateFilter[versionKey] = Number.isInteger(version)
        ? version
        : { $exists: false };
    } else {
      const error = new Error(
        "Today's puzzle cannot be safely repaired without a Mongo version key."
      );
      error.statusCode = 503;
      throw error;
    }

    const repairedPuzzle = await DailyPuzzle.findOneAndUpdate(
      updateFilter,
      {
        $set: replacement,
        $inc: { [versionKey]: 1 }
      },
      { new: true, runValidators: true }
    ).select("+verifiedSolutions");

    if (repairedPuzzle) {
      puzzle = repairedPuzzle;
      continue;
    }

    puzzle = await DailyPuzzle.findOne({ dateKey, mode })
      .select("+verifiedSolutions");

    if (!puzzle) {
      const error = new Error("Today's puzzle is temporarily unavailable.");
      error.statusCode = 503;
      throw error;
    }
  }

  const error = new Error(
    "Today's puzzle changed while resolving a duplicate. Please retry."
  );
  error.statusCode = 503;
  throw error;
}

module.exports = {
  getPacificDateKey,
  getDailyPuzzle,
  ensureDailyPuzzleForDate
};
