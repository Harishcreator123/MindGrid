const assert = require("node:assert/strict");
const test = require("node:test");
const DailyProgress = require("../models/DailyProgress");
const DailyPuzzle = require("../models/DailyPuzzle");
const { generateDailyPuzzle } = require("../generators/puzzleGenerator");
const { getPreviousDateKeys } = require("../services/dateKey");
const { getPuzzleFingerprint } = require("../services/puzzleFingerprint");
const { getDailyPuzzle, getPacificDateKey } = require("../services/dailyPuzzleService");

function queryResult(value) {
  return {
    select: async () => value
  };
}

function withModelStubs(stubs, run) {
  const originals = new Map(
    Object.keys(stubs).map((key) => [
      key,
      stubs[key].model[key]
    ])
  );

  for (const [key, stub] of Object.entries(stubs)) {
    stub.model[key] = stub.value;
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, original] of originals) {
        stubs[key].model[key] = original;
      }
    });
}

function createPuzzleDocument(puzzle, id, updatedAt = new Date(0)) {
  return {
    ...puzzle,
    _id: id,
    updatedAt
  };
}

function puzzleServiceStubs({
  history = [],
  getCurrentPuzzle,
  onUpdate,
  progressExists = async () => null
}) {
  return {
    find: {
      model: DailyPuzzle,
      value: () => queryResult(history)
    },
    findOne: {
      model: DailyPuzzle,
      value: () => queryResult(getCurrentPuzzle())
    },
    findOneAndUpdate: {
      model: DailyPuzzle,
      value: (filter, update) =>
        queryResult(onUpdate ? onUpdate(filter, update) : null)
    },
    exists: {
      model: DailyProgress,
      value: progressExists
    }
  };
}

test("service reads the canonical puzzle again instead of serving a stale cache", async () => {
  const dateKey = getPacificDateKey();
  const firstPuzzle = createPuzzleDocument(
    generateDailyPuzzle("Easy", dateKey),
    "first"
  );
  const secondPuzzle = createPuzzleDocument(
    generateDailyPuzzle("Easy", dateKey, {
      excludedFingerprints: new Set([
        getPuzzleFingerprint(firstPuzzle)
      ])
    }),
    "second",
    new Date(1)
  );
  let currentPuzzle = firstPuzzle;
  const stubs = puzzleServiceStubs({
    getCurrentPuzzle: () => currentPuzzle
  });

  await withModelStubs(stubs, async () => {
    const firstResult = await getDailyPuzzle("Easy", "player-a");
    currentPuzzle = secondPuzzle;
    const secondResult = await getDailyPuzzle("Easy", "player-a");

    assert.equal(firstResult._id, "first");
    assert.equal(secondResult._id, "second");
  });
});

test("a duplicate current puzzle is retained for existing progress and blocked for new players", async () => {
  const mode = "Easy";
  const dateKey = getPacificDateKey();
  const previousDateKey = getPreviousDateKeys(dateKey, 1)[0];
  const currentPuzzle = createPuzzleDocument(
    generateDailyPuzzle(mode, dateKey),
    "existing"
  );
  const previousPuzzle = {
    ...currentPuzzle,
    dateKey: previousDateKey
  };
  let replacementCount = 0;
  const stubs = puzzleServiceStubs({
    history: [previousPuzzle],
    getCurrentPuzzle: () => currentPuzzle,
    onUpdate: () => {
      replacementCount++;
      return null;
    },
    progressExists: async (filter) => {
      if (!filter.user) {
        return { _id: "some-progress" };
      }

      return filter.user === "player-with-progress"
        ? { _id: "progress" }
        : null;
    }
  });

  await withModelStubs(stubs, async () => {
    const existingPlayerPuzzle = await getDailyPuzzle(
      mode,
      "player-with-progress"
    );

    assert.equal(existingPlayerPuzzle._id, "existing");
    await assert.rejects(
      getDailyPuzzle(mode, "new-player"),
      (error) => error.statusCode === 503
    );
    assert.equal(replacementCount, 0);
  });
});

test("concurrent duplicate repairs use one canonical Mongo record", async () => {
  assert.equal(DailyPuzzle.schema.options.versionKey, "__v");

  const mode = "Easy";
  const dateKey = getPacificDateKey();
  const previousDateKey = getPreviousDateKeys(dateKey, 1)[0];
  let currentPuzzle = createPuzzleDocument(
    generateDailyPuzzle(mode, dateKey),
    "existing"
  );
  delete currentPuzzle.updatedAt;
  const previousPuzzle = {
    ...currentPuzzle,
    dateKey: previousDateKey
  };
  let updateCount = 0;
  const stubs = puzzleServiceStubs({
    history: [previousPuzzle],
    getCurrentPuzzle: () => currentPuzzle,
    onUpdate: (filter, update) => {
      assert.equal(filter.updatedAt, undefined);
      assert.deepEqual(filter.__v, { $exists: false });
      assert.deepEqual(update.$inc, { __v: 1 });

      if (Object.prototype.hasOwnProperty.call(currentPuzzle, "__v")) {
        return null;
      }

      updateCount++;
      currentPuzzle = {
        ...update.$set,
        _id: "existing",
        __v: 1
      };
      return currentPuzzle;
    }
  });

  await withModelStubs(stubs, async () => {
    const [first, second] = await Promise.all([
      getDailyPuzzle(mode, "player-a"),
      getDailyPuzzle(mode, "player-b")
    ]);

    assert.equal(first._id, "existing");
    assert.equal(second._id, "existing");
    assert.equal(
      getPuzzleFingerprint(first),
      getPuzzleFingerprint(second)
    );
    assert.notEqual(
      getPuzzleFingerprint(first),
      getPuzzleFingerprint(previousPuzzle)
    );
    assert.equal(updateCount, 1);
  });
});
