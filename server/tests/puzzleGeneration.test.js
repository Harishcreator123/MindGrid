const assert = require("node:assert/strict");
const test = require("node:test");
const { generateDailyPuzzle } = require("../generators/puzzleGenerator");
const { getPreviousDateKeys } = require("../services/dateKey");
const { getPuzzleFingerprint } = require("../services/puzzleFingerprint");
const {
  UNIQUENESS_DAYS,
  getPreviousPuzzleFingerprints
} = require("../services/puzzleHistory");

test("puzzle fingerprints detect identical boards and paths", () => {
  const puzzle = generateDailyPuzzle("Easy", "2026-11-21");
  const reorderedPuzzle = {
    ...puzzle,
    playableCells: [...puzzle.playableCells].reverse(),
    blockedCells: [...puzzle.blockedCells].reverse(),
    verifiedSolutions: [...puzzle.verifiedSolutions].reverse()
  };

  assert.equal(
    getPuzzleFingerprint(puzzle),
    getPuzzleFingerprint(reorderedPuzzle)
  );

  const differentBoardPuzzle = {
    ...puzzle,
    blockedCells: [...puzzle.blockedCells, puzzle.size * puzzle.size]
  };

  assert.notEqual(
    getPuzzleFingerprint(puzzle),
    getPuzzleFingerprint(differentBoardPuzzle)
  );

  const differentPathPuzzle = {
    ...puzzle,
    verifiedSolutions: puzzle.verifiedSolutions.map((path) => [...path].reverse())
  };

  assert.notEqual(
    getPuzzleFingerprint(puzzle),
    getPuzzleFingerprint(differentPathPuzzle)
  );
});

test("generator selects an alternative when a fingerprint collides", () => {
  const originalPuzzle = generateDailyPuzzle("Medium", "2026-11-21");
  const originalFingerprint = getPuzzleFingerprint(originalPuzzle);
  const alternativePuzzle = generateDailyPuzzle("Medium", "2026-11-21", {
    excludedFingerprints: new Set([originalFingerprint])
  });

  assert.notEqual(getPuzzleFingerprint(alternativePuzzle), originalFingerprint);
  assert.deepEqual(
    generateDailyPuzzle("Medium", "2026-11-21", {
      excludedFingerprints: new Set([originalFingerprint])
    }),
    alternativePuzzle
  );
});

test("date windows include leap days and reject impossible dates", () => {
  assert.deepEqual(
    getPreviousDateKeys("2024-03-01", 2),
    ["2024-02-28", "2024-02-29"]
  );
  assert.throws(
    () => generateDailyPuzzle("Easy", "2025-02-29"),
    /Invalid puzzle date/
  );
});

test("daily and practice puzzles stay unique over six future calendar years", {
  timeout: 120000
}, () => {
  const historyByMode = new Map(
    Object.keys(UNIQUENESS_DAYS).map((mode) => [mode, new Map()])
  );
  const date = new Date("2026-11-21T00:00:00.000Z");
  const endDate = new Date("2032-11-21T00:00:00.000Z");
  let generatedDays = 0;

  while (date < endDate) {
    const dateKey = date.toISOString().slice(0, 10);

    for (const [mode, lookbackDays] of Object.entries(UNIQUENESS_DAYS)) {
      const history = historyByMode.get(mode);
      const previousDateKeys = getPreviousDateKeys(dateKey, lookbackDays);
      const previousPuzzles = previousDateKeys
        .map((previousDateKey) => history.get(previousDateKey))
        .filter(Boolean);
      const excludedFingerprints = getPreviousPuzzleFingerprints(
        mode,
        dateKey,
        previousPuzzles
      );
      const puzzle = generateDailyPuzzle(mode, dateKey, {
        excludedFingerprints
      });
      const fingerprint = getPuzzleFingerprint(puzzle);

      assert.equal(excludedFingerprints.has(fingerprint), false, `${mode} ${dateKey}`);
      history.set(dateKey, puzzle);
      generatedDays++;
    }

    date.setUTCDate(date.getUTCDate() + 1);
  }

  assert.equal(generatedDays, 2192 * 4);

});

test("Challenge output is deterministic for the same global date key", () => {
  const firstPuzzle = generateDailyPuzzle("Challenge", "2028-02-29");
  const sameDatePuzzle = generateDailyPuzzle("Challenge", "2028-02-29");

  assert.deepEqual(sameDatePuzzle, firstPuzzle);
});
