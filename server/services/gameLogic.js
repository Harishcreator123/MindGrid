
const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
];

function getNeighbors(cell, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;

  return DIRECTIONS
    .map(([dr, dc]) => {
      const nextRow = row + dr;
      const nextCol = col + dc;

      if (
        nextRow < 0 ||
        nextRow >= size ||
        nextCol < 0 ||
        nextCol >= size
      ) {
        return null;
      }

      return nextRow * size + nextCol;
    })
    .filter(cell => cell !== null);
}

function validatePartialPath(path, puzzle) {
  if (!Array.isArray(path) || path.length === 0) {
    return { valid: false, reason: "Invalid path." };
  }

  const playable = new Set(puzzle.playableCells);
  const blocked = new Set(puzzle.blockedCells || []);

  if (path[0] !== puzzle.startCell) {
    return { valid: false, reason: "Invalid starting cell." };
  }

  const visited = new Set();
  let checkpointIndex = 0;
  const checkpoints = [...(puzzle.checkpoints || [])]
    .sort((a, b) => a.order - b.order);

  for (let i = 0; i < path.length; i++) {
    const cell = path[i];

    if (!Number.isInteger(cell) || !playable.has(cell)) {
      return { valid: false, reason: "Invalid cell." };
    }

    if (blocked.has(cell) || visited.has(cell)) {
      return { valid: false, reason: "Invalid move." };
    }

    if (i > 0) {
      const neighbors = getNeighbors(path[i - 1], puzzle.size);

      if (!neighbors.includes(cell)) {
        return { valid: false, reason: "Invalid move." };
      }
    }

    visited.add(cell);

    if (
      checkpointIndex < checkpoints.length &&
      cell === checkpoints[checkpointIndex].cell
    ) {
      checkpointIndex++;
    } else if (
      checkpoints.some(
        checkpoint =>
          checkpoint.cell === cell &&
          checkpoint.order > checkpointIndex + 1
      )
    ) {
      return { valid: false, reason: "Checkpoint order is incorrect." };
    }
  }

  return {
    valid: true,
    visitedCount: visited.size,
    nextCheckpointIndex: checkpointIndex
  };
}

function validateCompletedPath(path, puzzle) {
  const partial = validatePartialPath(path, puzzle);

  if (!partial.valid) return partial;

  if (path.length !== puzzle.totalPlayable) {
    return { valid: false, reason: "Route is incomplete." };
  }

  if (path[path.length - 1] !== puzzle.finishCell) {
    return { valid: false, reason: "Finish cell not reached." };
  }

  if (partial.nextCheckpointIndex !== puzzle.checkpoints.length) {
    return { valid: false, reason: "Not all checkpoints reached." };
  }

  return { valid: true };
}

function canCompletePath(path, puzzle, nodeLimit = 150000) {
  const initial = validatePartialPath(path, puzzle);

  if (!initial.valid) return false;

  const playable = new Set(puzzle.playableCells);
  const blocked = new Set(puzzle.blockedCells || []);
  const checkpoints = [...(puzzle.checkpoints || [])]
    .sort((a, b) => a.order - b.order);

  const visited = new Set(path);
  let nodes = 0;
  let limitReached = false;

  function search(current, checkpointIndex) {
    nodes++;

    if (nodes > nodeLimit) {
      limitReached = true;
      return false;
    }

    if (visited.size === puzzle.totalPlayable) {
      return (
        current === puzzle.finishCell &&
        checkpointIndex === checkpoints.length
      );
    }

    for (const next of getNeighbors(current, puzzle.size)) {
      if (
        !playable.has(next) ||
        blocked.has(next) ||
        visited.has(next)
      ) {
        continue;
      }

      let nextCheckpointIndex = checkpointIndex;

      if (
        nextCheckpointIndex < checkpoints.length &&
        next === checkpoints[nextCheckpointIndex].cell
      ) {
        nextCheckpointIndex++;
      } else if (
        checkpoints.some(
          checkpoint =>
            checkpoint.cell === next &&
            checkpoint.order > nextCheckpointIndex + 1
        )
      ) {
        continue;
      }

      // The finish cell must be the final move.
      if (
        next === puzzle.finishCell &&
        visited.size + 1 !== puzzle.totalPlayable
      ) {
        continue;
      }

      visited.add(next);

      if (search(next, nextCheckpointIndex)) {
        return true;
      }

      visited.delete(next);

      if (limitReached) return false;
    }

    return false;
  }

  const current = path[path.length - 1];

  const result = search(current, initial.nextCheckpointIndex);

  if (result) return true;
  if (limitReached) return null;

  return false;
}

module.exports = {
  getNeighbors,
  validatePartialPath,
  validateCompletedPath,
  canCompletePath
};
