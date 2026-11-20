
const {
  validateCompletedPath
} = require("./gameLogic");

const {
  verifyRouteCount
} = require("./routeCounter");

function verifyPuzzleIntegrity(puzzle, options = {}) {
  const size = puzzle.size;
  const playable = puzzle.playableCells;
  const blocked = puzzle.blockedCells || [];
  const solutions = puzzle.verifiedSolutions || [];

  if (!Number.isInteger(size) || size < 3 || size > 6) {
    return { valid: false, reason: "Invalid grid size." };
  }

  if (!Array.isArray(playable) || playable.length === 0) {
    return { valid: false, reason: "No playable cells." };
  }

  if (new Set(playable).size !== playable.length) {
    return { valid: false, reason: "Duplicate playable cells." };
  }

  const allCells = size * size;

  if (playable.some(
    cell => !Number.isInteger(cell) || cell < 0 || cell >= allCells
  )) {
    return { valid: false, reason: "Invalid playable cell." };
  }

  if (blocked.some(
    cell =>
      !Number.isInteger(cell) ||
      cell < 0 ||
      cell >= allCells ||
      playable.includes(cell)
  )) {
    return { valid: false, reason: "Invalid blocked cell." };
  }

  if (playable.length + blocked.length !== allCells) {
    return { valid: false, reason: "Board cell count mismatch." };
  }

  if (puzzle.totalPlayable !== playable.length) {
    return { valid: false, reason: "Playable cell count mismatch." };
  }

  if (
    !playable.includes(puzzle.startCell) ||
    !playable.includes(puzzle.finishCell)
  ) {
    return { valid: false, reason: "Invalid start or finish cell." };
  }

  if (
    !Array.isArray(solutions) ||
    solutions.length !== puzzle.verifiedRouteCount ||
    solutions.length === 0
  ) {
    return { valid: false, reason: "Solution count mismatch." };
  }

  for (const solution of solutions) {
    const result = validateCompletedPath(solution, puzzle);

    if (!result.valid) {
      return {
        valid: false,
        reason: "An official route is invalid."
      };
    }
  }

  const routeVerification = verifyRouteCount(puzzle, options);

  if (!routeVerification.valid) {
    return {
      valid: false,
      reason: routeVerification.reason ||
        "Puzzle has an incorrect route count.",
      routeVerification
    };
  }

  if (routeVerification.routeCount !== solutions.length) {
    return {
      valid: false,
      reason: "Stored solutions do not match the verified route count."
    };
  }

  return {
    valid: true,
    routeCount: routeVerification.routeCount
  };
}

module.exports = { verifyPuzzleIntegrity };
