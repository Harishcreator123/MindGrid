
const DIFFICULTIES = {
  Easy: {
    size: 3,
    minBombs: 3,
    maxBombs: 4,
    minRoutes: 1,
    maxRoutes: 1,
    checkpointCount: 1,
    startType: "corner",
    finishType: "corner",
  },
  Medium: {
    size: 4,
    minBombs: 4,
    maxBombs: 4,
    minRoutes: 2,
    maxRoutes: 2,
    checkpointCount: 2,
    startType: "corner",
    finishType: "non-corner",
  },
  Hard: {
    size: 5,
    minBombs: 6,
    maxBombs: 8,
    minRoutes: 2,
    maxRoutes: 3,
    checkpointCount: 3,
    startType: "non-corner",
    finishType: "non-corner",
  },
  Challenge: {
    size: 6,
    minBombs: 9,
    maxBombs: 12,
    minRoutes: 2,
    maxRoutes: 4,
    checkpointCount: 3,
    startType: "non-corner",
    finishType: "non-corner",
  },
};

const LETTERS = ["X", "Y", "Z"];

function randomNumber() {
  return Math.random();
}

function shuffle(items, random = randomNumber) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function createRandom(seed) {
  let state = seed >>> 0;

  return function () {
    state += 0x6D2B79F5;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function getNeighbors(index, size) {
  const row = Math.floor(index / size);
  const col = index % size;

  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ]
    .filter(
      ([r, c]) =>
        r >= 0 && r < size && c >= 0 && c < size
    )
    .map(([r, c]) => r * size + c);
}

export function isAdjacent(first, second, size) {
  if (
    !Number.isInteger(first) ||
    !Number.isInteger(second) ||
    first < 0 ||
    second < 0 ||
    first >= size * size ||
    second >= size * size
  ) {
    return false;
  }

  return getNeighbors(first, size).includes(second);
}

function isCorner(cell, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;

  return (
    (row === 0 || row === size - 1) &&
    (col === 0 || col === size - 1)
  );
}

function getEndpointCandidates(size, type) {
  const cells = Array.from(
    { length: size * size },
    (_, index) => index
  );

  if (type === "corner") {
    return cells.filter((cell) => isCorner(cell, size));
  }

  return cells.filter((cell) => !isCorner(cell, size));
}

function getCheckpointSequence(checkpoints = {}) {
  return Object.entries(checkpoints)
    .filter(([, value]) => LETTERS.includes(value))
    .sort(
      (a, b) =>
        LETTERS.indexOf(a[1]) -
        LETTERS.indexOf(b[1])
    )
    .map(([cell]) => Number(cell));
}

function createCheckpoints(path, count) {
  const checkpoints = {
    [path[0]]: 1,
  };

  for (let i = 0; i < count; i++) {
    const position = Math.floor(
      ((i + 1) * (path.length - 1)) / (count + 1)
    );

    checkpoints[path[position]] = LETTERS[i];
  }

  checkpoints[path[path.length - 1]] = path.length;

  return checkpoints;
}

function findCandidatePath(
  size,
  targetLength,
  startType,
  finishType,
  random,
  nodeLimit = 120000
) {
  let nodes = 0;

  const starts = shuffle(
    getEndpointCandidates(size, startType),
    random
  );

  for (const start of starts) {
    const path = [start];
    const visited = new Set(path);

    function search(current) {
      nodes++;

      if (nodes > nodeLimit) return false;

      if (path.length === targetLength) {
        return getEndpointCandidates(
          size,
          finishType
        ).includes(current);
      }

      const candidates = shuffle(
        getNeighbors(current, size).filter(
          (cell) => !visited.has(cell)
        ),
        random
      );

      for (const next of candidates) {
        visited.add(next);
        path.push(next);

        if (search(next)) return true;

        path.pop();
        visited.delete(next);

        if (nodes > nodeLimit) return false;
      }

      return false;
    }

    if (search(start)) return [...path];

    if (nodes > nodeLimit) break;
  }

  return null;
}

export function countValidRoutes(
  puzzle,
  limit = 5,
  nodeLimit = 60000
) {
  if (!puzzle || !Array.isArray(puzzle.playableCells)) {
    return { count: 0, exact: false, exceeded: false };
  }

  const playable = new Set(puzzle.playableCells);
  const total = playable.size;
  const start = puzzle.startCell;
  const finish = puzzle.finishCell;
  const checkpoints = getCheckpointSequence(
    puzzle.checkpoints
  );

  if (!playable.has(start) || !playable.has(finish)) {
    return { count: 0, exact: true, exceeded: false };
  }

  let count = 0;
  let nodes = 0;
  let exceeded = false;

  const visited = new Set([start]);

  function search(current, checkpointIndex) {
    if (count >= limit || exceeded) return;

    nodes++;

    if (nodes > nodeLimit) {
      exceeded = true;
      return;
    }

    if (visited.size === total) {
      if (
        current === finish &&
        checkpointIndex === checkpoints.length
      ) {
        count++;
      }

      return;
    }

    if (current === finish) return;

    for (const next of getNeighbors(current, puzzle.size)) {
      if (!playable.has(next) || visited.has(next)) continue;

      if (next === finish && visited.size !== total - 1) {
        continue;
      }

      const required = checkpoints[checkpointIndex];
      const checkpointPosition = checkpoints.indexOf(next);

      if (
        checkpointPosition !== -1 &&
        next !== required
      ) {
        continue;
      }

      visited.add(next);

      search(
        next,
        checkpointIndex + (next === required ? 1 : 0)
      );

      visited.delete(next);

      if (count >= limit || exceeded) return;
    }
  }

  search(start, 0);

  return {
    count,
    exact: !exceeded && count < limit,
    exceeded,
  };
}

function buildPuzzle(difficulty, path, bombCount, random) {
  const config = DIFFICULTIES[difficulty];
  const size = config.size;
  const total = size * size;

  const playableCells = [...path];
  const playableSet = new Set(path);

  const blockedCells = Array.from(
    { length: total },
    (_, index) => index
  ).filter((index) => !playableSet.has(index));

  const checkpoints = createCheckpoints(
    path,
    config.checkpointCount
  );

  return {
    id: `MG-${difficulty}-${Math.floor(random() * 1e12)}`,
    difficulty,
    size,
    startCell: path[0],
    finishCell: path[path.length - 1],
    playableCells,
    blockedCells,
    checkpoints,
    totalPlayable: path.length,
    bombCount,
    solution: [...path],
    solutionCount: null,
    verified: false,
  };
}

export function generatePuzzle(
  difficultyOrSize = "Easy",
  legacyDifficulty,
  seed
) {
  let difficulty;

  if (typeof difficultyOrSize === "string") {
    difficulty = difficultyOrSize;
  } else {
    const legacyMap = {
      3: "Easy",
      4: "Medium",
      5: "Hard",
      6: "Challenge",
    };

    difficulty =
      legacyDifficulty || legacyMap[difficultyOrSize];
  }

  const config = DIFFICULTIES[difficulty];

  if (!config) {
    throw new Error(
      "Choose Easy, Medium, Hard or Challenge."
    );
  }

  const random =
    typeof seed === "number"
      ? createRandom(seed)
      : randomNumber;

  const total = config.size * config.size;
  const minimumPlayable = total - config.maxBombs;
  const maximumPlayable = total - config.minBombs;

  let fallback = null;

  for (let attempt = 0; attempt < 120; attempt++) {
    const targetLength =
      minimumPlayable +
      Math.floor(
        random() * (maximumPlayable - minimumPlayable + 1)
      );

    const bombCount = total - targetLength;

    const path = findCandidatePath(
      config.size,
      targetLength,
      config.startType,
      config.finishType,
      random
    );

    if (!path) continue;

    const puzzle = buildPuzzle(
      difficulty,
      path,
      bombCount,
      random
    );

    if (!fallback) fallback = puzzle;

    const verification = countValidRoutes(
      puzzle,
      config.maxRoutes + 1
    );

    if (
      !verification.exceeded &&
      verification.count >= config.minRoutes &&
      verification.count <= config.maxRoutes
    ) {
      puzzle.solutionCount = verification.count;
      puzzle.verified = true;
      return puzzle;
    }
  }

  if (fallback) {
    fallback.solutionCount = null;
    fallback.verified = false;
    return fallback;
  }

  throw new Error(
    `Could not create a playable ${difficulty} puzzle. Please try again.`
  );
}

export function validatePath(playerPath, puzzle) {
  if (
    !Array.isArray(playerPath) ||
    !puzzle ||
    !Array.isArray(puzzle.playableCells) ||
    playerPath.length !== puzzle.totalPlayable
  ) {
    return false;
  }

  if (new Set(playerPath).size !== playerPath.length) {
    return false;
  }

  const playable = new Set(puzzle.playableCells);

  if (playerPath.some((cell) => !playable.has(cell))) {
    return false;
  }

  if (
    playerPath[0] !== puzzle.startCell ||
    playerPath[playerPath.length - 1] !== puzzle.finishCell
  ) {
    return false;
  }

  for (let i = 1; i < playerPath.length; i++) {
    if (
      !isAdjacent(
        playerPath[i - 1],
        playerPath[i],
        puzzle.size
      )
    ) {
      return false;
    }
  }

  const checkpoints = getCheckpointSequence(
    puzzle.checkpoints
  );

  let checkpointIndex = 0;

  for (const cell of playerPath) {
    if (cell === checkpoints[checkpointIndex]) {
      checkpointIndex++;
    } else if (checkpoints.includes(cell)) {
      return false;
    }
  }

  return checkpointIndex === checkpoints.length;
}

/*
  Checks whether a player's current route can still be completed.

  Returns:
  true  = a valid completion is possible.
  false = no valid completion exists.
  null  = search limit reached; do not declare a dead end.
*/
export function canCompletePath(
  playerPath,
  puzzle,
  nodeLimit = 150000
) {
  if (
    !puzzle ||
    !Array.isArray(playerPath) ||
    !Array.isArray(puzzle.playableCells) ||
    playerPath.length === 0
  ) {
    return false;
  }

  const playable = new Set(puzzle.playableCells);
  const checkpoints = getCheckpointSequence(
    puzzle.checkpoints
  );

  if (playerPath[0] !== puzzle.startCell) return false;

  const visited = new Set();

  let checkpointIndex = 0;

  for (let i = 0; i < playerPath.length; i++) {
    const cell = playerPath[i];

    if (!playable.has(cell) || visited.has(cell)) {
      return false;
    }

    if (
      i > 0 &&
      !isAdjacent(playerPath[i - 1], cell, puzzle.size)
    ) {
      return false;
    }

    if (cell === checkpoints[checkpointIndex]) {
      checkpointIndex++;
    } else if (checkpoints.includes(cell)) {
      return false;
    }

    visited.add(cell);
  }

  const current = playerPath[playerPath.length - 1];
  const finish = puzzle.finishCell;
  const total = playable.size;

  if (current === finish) {
    return visited.size === total &&
      checkpointIndex === checkpoints.length;
  }

  if (visited.size >= total) return false;

  let nodes = 0;
  let exceeded = false;

  function search(cell, nextCheckpointIndex) {
    nodes++;

    if (nodes > nodeLimit) {
      exceeded = true;
      return false;
    }

    if (visited.size === total) {
      return (
        cell === finish &&
        nextCheckpointIndex === checkpoints.length
      );
    }

    if (cell === finish) return false;

    for (const next of getNeighbors(cell, puzzle.size)) {
      if (!playable.has(next) || visited.has(next)) {
        continue;
      }

      if (next === finish && visited.size !== total - 1) {
        continue;
      }

      const required = checkpoints[nextCheckpointIndex];
      const checkpointPosition = checkpoints.indexOf(next);

      if (
        checkpointPosition !== -1 &&
        next !== required
      ) {
        continue;
      }

      visited.add(next);

      const found = search(
        next,
        nextCheckpointIndex +
          (next === required ? 1 : 0)
      );

      visited.delete(next);

      if (found) return true;
      if (exceeded) return false;
    }

    return false;
  }

  const possible = search(current, checkpointIndex);

  if (possible) return true;
  if (exceeded) return null;

  return false;
}

export function getDifficultyConfig(difficulty) {
  const config = DIFFICULTIES[difficulty];

  return config ? { ...config } : null;
}
