
function toPublicPuzzle(puzzle) {
  return {
    puzzleId: puzzle._id.toString(),
    dateKey: puzzle.dateKey,
    mode: puzzle.mode,
    size: puzzle.size,
    startCell: puzzle.startCell,
    finishCell: puzzle.finishCell,
    playableCells: puzzle.playableCells,
    blockedCells: puzzle.blockedCells,
    checkpoints: puzzle.checkpoints,
    totalPlayable: puzzle.totalPlayable
  };
}

module.exports = { toPublicPuzzle };
