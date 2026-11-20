
const DailyPuzzle = require("../models/DailyPuzzle");
const {
  verifyPuzzleIntegrity
} = require("./puzzleIntegrity");

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

  return puzzle;
}

module.exports = {
  getPacificDateKey,
  getDailyPuzzle
};
