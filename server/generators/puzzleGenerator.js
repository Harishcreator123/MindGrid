const crypto = require("crypto");
const {
  verifyRouteCount
} = require("../services/routeCounter");

const GENERATOR_CONFIG = {
  Easy: {
    size: 3,
    minCells: 7,
    maxCells: 9,
    checkpointCount: 1
  },
  Medium: {
    size: 4,
    minCells: 9,
    maxCells: 13,
    checkpointCount: 2
  },
  Hard: {
    size: 5,
    minCells: 13,
    maxCells: 18,
    checkpointCount: 3
  },
  Challenge: {
    size: 6,
    minCells: 18,
    maxCells: 24,
    checkpointCount: 3
  }
};

function createRandom(seed) {
  let counter = 0;

  return function random() {
    const hash = crypto
      .createHash("sha256")
      .update(`${seed}:${counter++}`)
      .digest("hex");

    return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  };
}

function shuffle(items, random) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function getNeighbors(cell, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;

  const candidates = [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1]
  ];

  return candidates
    .filter(([r, c]) =>
      r >= 0 && r < size && c >= 0 && c < size
    )
    .map(([r, c]) => r * size + c);
}

function createRandomPath(size, targetLength, random) {
  const totalCells = size * size;
  const start = Math.floor(random() * totalCells);

  const path = [start];
  const visited = new Set(path);

  function search(current) {
    if (path.length === targetLength) {
      return true;
    }

    const options = shuffle(
      getNeighbors(current, size).filter(
        cell => !visited.has(cell)
      ),
      random
    );

    for (const next of options) {
      visited.add(next);
      path.push(next);

      if (search(next)) return true;

      path.pop();
      visited.delete(next);
    }

    return false;
  }

  return search(start) ? [...path] : null;
}

function createCheckpoints(path, count, random) {
  if (count === 0) return [];

  const possibleIndexes = [];

  for (let i = 1; i < path.length - 1; i++) {
    possibleIndexes.push(i);
  }

  if (possibleIndexes.length < count) {
    return null;
  }

  const selected = shuffle(possibleIndexes, random)
    .slice(0, count)
    .sort((a, b) => a - b);

  return selected.map((pathIndex, index) => ({
    label: ["X", "Y", "Z"][index],
    cell: path[pathIndex],
    order: index + 1
  }));
}

function generateCandidate(mode, dateKey, attempt) {
  const config = GENERATOR_CONFIG[mode];
  const random = createRandom(`${dateKey}:${mode}:${attempt}`);

  const range =
    config.maxCells - config.minCells + 1;

  const targetLength =
    config.minCells + Math.floor(random() * range);

  const path = createRandomPath(
    config.size,
    targetLength,
    random
  );

  if (!path) return null;

  const checkpoints = createCheckpoints(
    path,
    config.checkpointCount,
    random
  );

  if (!checkpoints) return null;

  const playableCells = [...path].sort((a, b) => a - b);
  const playableSet = new Set(playableCells);

  const blockedCells = Array.from(
    { length: config.size * config.size },
    (_, index) => index
  ).filter(cell => !playableSet.has(cell));

  return {
    dateKey,
    mode,
    size: config.size,
    startCell: path[0],
    finishCell: path[path.length - 1],
    playableCells,
    blockedCells,
    checkpoints,
    totalPlayable: playableCells.length
  };
}

function generateDailyPuzzle(mode, dateKey, options = {}) {
  const config = GENERATOR_CONFIG[mode];

  if (!config) {
    throw new Error("Invalid puzzle mode.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Invalid puzzle date.");
  }

  const maxAttempts = options.maxAttempts || 300;
  const nodeLimit = options.nodeLimit || 5000000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateCandidate(
      mode,
      dateKey,
      attempt
    );

    if (!candidate) continue;

    const verification = verifyRouteCount(candidate, {
      nodeLimit
    });

    if (!verification.valid || !verification.verified) {
      continue;
    }

    return {
      ...candidate,
      verifiedSolutions: verification.solutions,
      verifiedRouteCount: verification.routeCount,
      verified: true
    };
  }

  throw new Error(
    `Could not generate a verified ${mode} puzzle for ${dateKey}. No unverified puzzle was saved.`
  );
}

module.exports = {
  GENERATOR_CONFIG,
  generateDailyPuzzle
};