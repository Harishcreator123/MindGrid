const { generateDailyPuzzle } = require("../generators/puzzleGenerator");
const { getPreviousDateKeys } = require("./dateKey");
const { getPuzzleFingerprint } = require("./puzzleFingerprint");

const UNIQUENESS_DAYS = {
  Easy: 7,
  Medium: 7,
  Hard: 7,
  Challenge: 30
};

function getPreviousPuzzleFingerprints(mode, dateKey, existingPuzzles = []) {
  const lookbackDays = UNIQUENESS_DAYS[mode];

  if (!lookbackDays) {
    throw new Error("Invalid puzzle mode.");
  }

  const previousDateKeys = getPreviousDateKeys(dateKey, lookbackDays);
  const puzzlesByDate = new Map(
    existingPuzzles.map((puzzle) => [puzzle.dateKey, puzzle])
  );
  const fingerprints = new Set();

  for (const previousDateKey of previousDateKeys) {
    const puzzle = puzzlesByDate.get(previousDateKey) ||
      generateDailyPuzzle(mode, previousDateKey, {
        excludedFingerprints: fingerprints
      });

    fingerprints.add(getPuzzleFingerprint(puzzle));
  }

  return fingerprints;
}

module.exports = {
  UNIQUENESS_DAYS,
  getPreviousPuzzleFingerprints
};
