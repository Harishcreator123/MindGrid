
const DailyPuzzle = require("../models/DailyPuzzle");
const {
  verifyPuzzleIntegrity
} = require("./puzzleIntegrity");

const DAILY_PUZZLE_CACHE_TTL_MS = 30 * 60 * 1000;
const DAILY_PUZZLE_CACHE_MAX_ENTRIES = 32;
const dailyPuzzleCache = new Map();
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

async function getDailyPuzzle(mode) {
  const allowedModes = ["Easy", "Medium", "Hard", "Challenge"];

  if (!allowedModes.includes(mode)) {
    const error = new Error("Invalid game mode.");
    error.statusCode = 400;
    throw error;
  }

  const dateKey = getPacificDateKey();
  const cacheKey = `${dateKey}:${mode}`;
  const now = Date.now();

  for (const [key, entry] of dailyPuzzleCache) {
    if (entry.expiresAt <= now) {
      dailyPuzzleCache.delete(key);
    }
  }

  const cached = dailyPuzzleCache.get(cacheKey);
  if (cached) {
    return cached.puzzle;
  }

  if (dailyPuzzleRequests.has(cacheKey)) {
    return dailyPuzzleRequests.get(cacheKey);
  }

  const request = (async () => {
    const puzzle = await DailyPuzzle.findOne({
      dateKey,
      mode,
      verified: true
    }).select("+verifiedSolutions");

    if (!puzzle) {
      const error = new Error(
        `No verified ${mode} puzzle is available for ${dateKey}.`
      );
      error.statusCode = 503;
      throw error;
    }

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

    if (dailyPuzzleCache.size >= DAILY_PUZZLE_CACHE_MAX_ENTRIES) {
      const oldestKey = dailyPuzzleCache.keys().next().value;
      if (oldestKey !== undefined) {
        dailyPuzzleCache.delete(oldestKey);
      }
    }

    dailyPuzzleCache.set(cacheKey, {
      puzzle,
      expiresAt: Date.now() + DAILY_PUZZLE_CACHE_TTL_MS
    });

    return puzzle;
  })();

  dailyPuzzleRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    dailyPuzzleRequests.delete(cacheKey);
  }
}

module.exports = {
  getPacificDateKey,
  getDailyPuzzle
};
