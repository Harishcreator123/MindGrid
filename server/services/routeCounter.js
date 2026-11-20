const { getNeighbors } = require("./gameLogic");

const ROUTE_REQUIREMENTS = {
  Easy: { min: 1, max: 1 },
  Medium: { min: 2, max: 2 },
  Hard: { min: 2, max: 3 },
  Challenge: { min: 2, max: 4 }
};

function countValidRoutes(puzzle, options = {}) {
  const nodeLimit = options.nodeLimit || 5000000;
  const maxRoutes = options.maxRoutes || 4;

  const playable = new Set(puzzle.playableCells);
  const blocked = new Set(puzzle.blockedCells || []);
  const checkpoints = [...(puzzle.checkpoints || [])]
    .sort((a, b) => a.order - b.order);

  const visited = new Set([puzzle.startCell]);
  const currentPath = [puzzle.startCell];
  const solutions = [];

  let nodesVisited = 0;
  let limitReached = false;
  let tooManyRoutes = false;

  function search(current, checkpointIndex) {
    if (limitReached || tooManyRoutes) return;

    nodesVisited++;

    if (nodesVisited > nodeLimit) {
      limitReached = true;
      return;
    }

    if (visited.size === puzzle.totalPlayable) {
      if (
        current === puzzle.finishCell &&
        checkpointIndex === checkpoints.length
      ) {
        solutions.push([...currentPath]);

        if (solutions.length > maxRoutes) {
          tooManyRoutes = true;
        }
      }

      return;
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

      // The finish cell must be the final cell.
      if (
        next === puzzle.finishCell &&
        visited.size + 1 !== puzzle.totalPlayable
      ) {
        continue;
      }

      visited.add(next);
      currentPath.push(next);

      search(next, nextCheckpointIndex);

      currentPath.pop();
      visited.delete(next);

      if (limitReached || tooManyRoutes) return;
    }
  }

  search(puzzle.startCell, 0);

  return {
    routeCount: solutions.length,
    solutions,
    nodesVisited,
    complete: !limitReached && !tooManyRoutes,
    limitReached,
    tooManyRoutes
  };
}

function verifyRouteCount(puzzle, options = {}) {
  const requirement = ROUTE_REQUIREMENTS[puzzle.mode];

  if (!requirement) {
    return {
      valid: false,
      reason: "Unknown difficulty."
    };
  }

  const result = countValidRoutes(puzzle, {
    ...options,
    maxRoutes: requirement.max
  });

  if (result.limitReached) {
    return {
      valid: false,
      verified: false,
      reason: "Route verification reached its search limit.",
      ...result
    };
  }

  if (result.tooManyRoutes) {
    return {
      valid: false,
      verified: true,
      reason: "Puzzle has more routes than allowed.",
      ...result
    };
  }

  const valid =
    result.routeCount >= requirement.min &&
    result.routeCount <= requirement.max;

  return {
    valid,
    verified: true,
    expected: requirement,
    ...result
  };
}

module.exports = {
  ROUTE_REQUIREMENTS,
  countValidRoutes,
  verifyRouteCount
};