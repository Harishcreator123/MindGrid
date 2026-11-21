const crypto = require("crypto");

function comparePaths(first, second) {
  const length = Math.min(first.length, second.length);

  for (let index = 0; index < length; index++) {
    if (first[index] !== second[index]) {
      return first[index] - second[index];
    }
  }

  return first.length - second.length;
}

function getPuzzleFingerprint(puzzle) {
  if (
    !puzzle ||
    !Array.isArray(puzzle.playableCells) ||
    !Array.isArray(puzzle.blockedCells) ||
    !Array.isArray(puzzle.checkpoints) ||
    !Array.isArray(puzzle.verifiedSolutions)
  ) {
    throw new Error("Cannot fingerprint an incomplete puzzle.");
  }

  const canonicalPuzzle = {
    mode: puzzle.mode,
    size: puzzle.size,
    startCell: puzzle.startCell,
    finishCell: puzzle.finishCell,
    playableCells: [...puzzle.playableCells].sort((a, b) => a - b),
    blockedCells: [...puzzle.blockedCells].sort((a, b) => a - b),
    checkpoints: puzzle.checkpoints
      .map(({ label, cell, order }) => ({ label, cell, order }))
      .sort((a, b) => a.order - b.order || a.cell - b.cell),
    verifiedSolutions: puzzle.verifiedSolutions
      .map((path) => Array.from(path))
      .sort(comparePaths)
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalPuzzle))
    .digest("hex");
}

module.exports = { getPuzzleFingerprint };
