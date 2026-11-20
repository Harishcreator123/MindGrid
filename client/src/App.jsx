
import { useState, useEffect } from "react";
import {
  generatePuzzle,
  validatePath,
  canCompletePath,
} from "./gameEngine";
import Auth from "./Auth";
import { startGame as startServerGame } from "./api";
import "./App.css";

const DIFFICULTIES = {
  Easy: { size: 3, undo: true },
  Medium: { size: 4, undo: true },
  Hard: { size: 5, undo: false },
  Challenge: { size: 6, undo: false },
};

const WIN_MESSAGES = {
  Easy: "🎉 Fantastic! Today's Easy puzzle is complete. Come back tomorrow for a fresh one!",
  Medium: "🏆 Brilliant work! You've conquered Medium. A new puzzle awaits tomorrow!",
  Hard: "🔥 Outstanding! You've mastered Hard. See you tomorrow for another challenge!",
  Challenge: "👑 MindGrid Champion! Today's Challenge is complete. Your streak continues!",
};

const CHALLENGE_POINTS_PER_CELL = 10;

function App() {
  const [difficulty, setDifficulty] = useState("Easy");
  const [gameMode, setGameMode] = useState("practice");

  const [puzzle, setPuzzle] = useState(() =>
    generatePuzzle("Easy")
  );

  const [path, setPath] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [score, setScore] = useState(0);
  const [challengeBombsSelected, setChallengeBombsSelected] = useState(0);
  const [message, setMessage] = useState(
    "Start by selecting number 1."
  );

  const [showAuth, setShowAuth] = useState(false);
  const [loadingGame, setLoadingGame] = useState(false);
  const [pendingGame, setPendingGame] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("mindgridUser")
      ) || null;
    } catch {
      return null;
    }
  });

  const [bombHit, setBombHit] = useState(null);
  const [flipCell, setFlipCell] = useState(null);

  const TOTAL_CELLS = puzzle.totalPlayable;
  const started = path.length > 0;

  const checkpointOrder = ["X", "Y", "Z"].filter((letter) =>
    Object.values(puzzle.checkpoints).includes(letter)
  );

  const checkpointCells = checkpointOrder.map((letter) =>
    Number(
      Object.keys(puzzle.checkpoints).find(
        (key) => puzzle.checkpoints[key] === letter
      )
    )
  );

  const startCell = puzzle.startCell ?? puzzle.solution[0];

  const finishCell =
    puzzle.finishCell ??
    puzzle.solution[puzzle.solution.length - 1];

  const nextCheckpointIndex = checkpointCells.findIndex(
    (cell) => !path.includes(cell)
  );

  const nextCheckpoint =
    nextCheckpointIndex === -1
      ? null
      : checkpointCells[nextCheckpointIndex];

  const canUndo = DIFFICULTIES[difficulty].undo;

  useEffect(() => {
    if (!started || completed || failed) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsed((previous) => previous + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [started, completed, failed]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remaining
    ).padStart(2, "0")}`;
  };

  const handleAuthSuccess = (data) => {
    sessionStorage.setItem("mindgridToken", data.token);
    sessionStorage.setItem(
      "mindgridUser",
      JSON.stringify(data.user)
    );

    setCurrentUser(data.user);
    setShowAuth(false);

    if (pendingGame) {
      const requestedGame = pendingGame;
      setPendingGame(null);
      changeDifficulty(requestedGame.difficulty, requestedGame.mode);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("mindgridToken");
    sessionStorage.removeItem("mindgridUser");

    setCurrentUser(null);
    setMessage("You have signed out successfully.");
  };

  const resetGameState = () => {
    setPath([]);
    setElapsed(0);
    setCompleted(false);
    setFailed(false);
    setScore(0);
    setChallengeBombsSelected(0);
    setBombHit(null);
    setFlipCell(null);
    setMessage("Start by selecting number 1.");
  };

  const changeDifficulty = async (
    selected,
    selectedMode = "practice"
  ) => {
    const requestedGame = { difficulty: selected, mode: selectedMode };

    if (!sessionStorage.getItem("mindgridToken")) {
      setPendingGame(requestedGame);
      setShowAuth(true);
      setMessage("Sign in to load today's official puzzle.");
      return;
    }

    setLoadingGame(true);
    setMessage("Loading today's official puzzle...");

    try {
      const result = await startServerGame(selected);
      const nextPuzzle = result.puzzle;
      const savedProgress = result.modeProgress || {};

      setDifficulty(selected);
      setGameMode(selectedMode);
      setPuzzle(nextPuzzle);
      resetGameState();

      if (result.resumed && Array.isArray(savedProgress.currentPath)) {
        setPath(savedProgress.currentPath);
        setElapsed(savedProgress.elapsedSeconds || 0);
      }

      setMessage(
        result.resumed
          ? `${selected} game resumed. Continue your route.`
          : selectedMode === "daily"
            ? "Daily Challenge loaded from the server. Start at number 1."
            : `${selected} daily practice loaded. Start at number 1.`
      );
    } catch (error) {
      console.error("Server puzzle loading failed:", error);
      if (error.status === 401) {
        sessionStorage.removeItem("mindgridToken");
        sessionStorage.removeItem("mindgridUser");
        setCurrentUser(null);
        setPendingGame(requestedGame);
        setShowAuth(true);
      }
      setMessage(error.message || "Unable to load today's puzzle. Please try again.");
    } finally {
      setLoadingGame(false);
    }
  };

  const startDailyChallenge = () => {
    changeDifficulty("Challenge", "daily");

    document.getElementById("play")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const startPractice = (selected) => {
    changeDifficulty(selected, "practice");

    document.getElementById("play")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const handleDifficultyChange = (event) => {
    changeDifficulty(event.target.value, "practice");
  };

  const handleBombClick = (index) => {
    if (completed || failed) return;

    setBombHit(index);

    if (difficulty === "Challenge") {
      setChallengeBombsSelected((previous) => previous + 1);
      setPath((previous) =>
        previous.slice(0, Math.max(0, previous.length - 2))
      );
      setMessage("💣 Challenge bomb: −10 points and your last 2 filled cells removed. Try different cells.");
    } else if (difficulty === "Hard") {
      setPath((previous) =>
        previous.slice(0, Math.max(0, previous.length - 2))
      );
      setMessage("💣 Two moves have been removed. Try different cells.");
    } else {
      setMessage("💣 Blocked cell. Try different cells.");
    }

    window.setTimeout(() => {
      setBombHit((current) =>
        current === index ? null : current
      );
    }, 700);
  };


  const endFailedAttempt = (updatedPath) => {
    setPath(updatedPath);
    setFailed(true);

    if (difficulty === "Challenge") {
      // The server keeps solutions private; use the surviving filled-cell count
      // for local display scoring, then subtract every Challenge bomb penalty.
      const correctCells = updatedPath.length;
      const basePoints = correctCells * CHALLENGE_POINTS_PER_CELL;
      const bombPenalty = challengeBombsSelected * CHALLENGE_POINTS_PER_CELL;
      const partialScore = Math.max(0, basePoints - bombPenalty);

      setScore(partialScore);

      setMessage(
        "Challenge attempt ended. Your points are calculated from your correctly filled cells."
      );
    } else {
      setScore(0);

      setMessage(
        "No complete route remains. Restart the game and try a different path."
      );
    }
  };

  const handleCellClick = (index) => {
    if (completed || failed) return;

    if (puzzle.blockedCells.includes(index)) {
      handleBombClick(index);
      return;
    }

    if (path.includes(index)) {
      setMessage("Try other cells.");
      return;
    }

    if (path.length === 0) {
      if (index !== startCell) {
        setMessage("Start your journey at number 1.");
        return;
      }

      const firstPath = [index];
      setPath(firstPath);

      const possible = canCompletePath(firstPath, puzzle);

      if (possible === false) {
        endFailedAttempt(firstPath);
      } else {
        setMessage(
          "Great start! Find the next checkpoint."
        );
      }

      return;
    }

    const previousCell = path[path.length - 1];

    const rowA = Math.floor(previousCell / puzzle.size);
    const colA = previousCell % puzzle.size;
    const rowB = Math.floor(index / puzzle.size);
    const colB = index % puzzle.size;

    const adjacent =
      Math.abs(rowA - rowB) + Math.abs(colA - colB) === 1;

    if (!adjacent) {
      setMessage("Try different cells.");
      return;
    }

    const checkpoint = puzzle.checkpoints[index];

    if (
      checkpoint &&
      ["X", "Y", "Z"].includes(checkpoint)
    ) {
      const expectedCheckpoint =
        nextCheckpoint === null
          ? null
          : puzzle.checkpoints[nextCheckpoint];

      if (checkpoint !== expectedCheckpoint) {
        setMessage("Try different cells.");
        return;
      }
    }

    if (
      index === finishCell &&
      path.length !== TOTAL_CELLS - 1
    ) {
      setMessage("Try different cells.");
      return;
    }

    if (
      path.length >= TOTAL_CELLS - 1 &&
      index !== finishCell
    ) {
      setMessage("Try different cells.");
      return;
    }

    const updatedPath = [...path, index];

    // Check for a successful complete route first.
    if (index === finishCell) {
      if (
        updatedPath.length !== TOTAL_CELLS ||
        !validatePath(updatedPath, puzzle)
      ) {
        setMessage("Try different cells.");
        return;
      }

      setPath(updatedPath);

      const timeScore = Math.max(100, 1000 - elapsed * 5);
      const finalScore = difficulty === "Challenge"
        ? Math.max(0, timeScore - challengeBombsSelected * CHALLENGE_POINTS_PER_CELL)
        : timeScore;

      setScore(finalScore);
      setCompleted(true);
      setMessage(WIN_MESSAGES[difficulty]);

      return;
    }

    setPath(updatedPath);

    const remainingPossible = canCompletePath(updatedPath, puzzle);
    if (remainingPossible === false) {
      endFailedAttempt(updatedPath);
      return;
    }

    if (
      checkpoint &&
      ["X", "Y", "Z"].includes(checkpoint)
    ) {
      setFlipCell(index);

      window.setTimeout(() => {
        setFlipCell((current) =>
          current === index ? null : current
        );
      }, 550);

      setMessage(
        `Checkpoint ${checkpoint} reached! Progress: ${updatedPath.length}/${TOTAL_CELLS}.`
      );
    } else {
      setMessage(
        `${updatedPath.length}/${TOTAL_CELLS} playable cells completed.`
      );
    }
  };

  const undoMove = () => {
    if (
      !canUndo ||
      completed ||
      failed ||
      path.length === 0
    ) {
      return;
    }

    const updatedPath = path.slice(0, -1);

    setPath(updatedPath);
    setFlipCell(null);

    if (updatedPath.length === 0) {
      setElapsed(0);
      setMessage("Start by selecting number 1.");
    } else {
      setMessage("Last move undone.");
    }
  };

  const restartAfterFailure = () => {
    changeDifficulty(difficulty, gameMode);
  };

  const renderGrid = () => {
    return Array.from(
      { length: puzzle.size * puzzle.size },
      (_, index) => {
        const checkpoint = puzzle.checkpoints[index];
        const pathIndex = path.indexOf(index);
        const isActive = pathIndex !== -1;
        const isBlocked = puzzle.blockedCells.includes(index);

        let cellContent = "";

        if (isBlocked) {
          cellContent = "💣";
        } else if (isActive) {
          cellContent = pathIndex + 1;
        } else if (index === startCell) {
          cellContent = 1;
        } else if (checkpoint) {
          cellContent = checkpoint;
        } else if (index === finishCell) {
          cellContent = puzzle.totalPlayable ?? TOTAL_CELLS;
        }

        const classes = [
          "grid-cell",
          checkpoint ? "checkpoint" : "",
          isActive ? "active" : "",
          isBlocked ? "blocked" : "",
          bombHit === index ? "bomb-hit" : "",
          flipCell === index ? "checkpoint-flip" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={index}
            className={classes}
            onClick={() => handleCellClick(index)}
            disabled={completed || failed}
            aria-label={
              isBlocked
                ? "Blocked bomb cell"
                : `Puzzle cell ${index + 1}`
            }
          >
            {cellContent}
          </button>
        );
      }
    );
  };

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="navbar">
        <a className="logo" href="#">
          <span className="logo-icon">M</span>
          MindGrid
        </a>

        <div className="nav-links">
          <a href="#play">Play</a>
          <a href="#how-to-play">How to Play</a>
          <a href="#about">About</a>
        </div>

        {currentUser ? (
          <div className="user-menu">
            <span>Hi, {currentUser.name}</span>
            <button
              className="login-btn"
              onClick={handleLogout}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            className="login-btn"
            onClick={() => setShowAuth(true)}
          >
            Sign In
          </button>
        )}
      </nav>

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="hero-content">
            <span className="eyebrow">
              ✦ YOUR DAILY BRAIN CHALLENGE
            </span>

            <h1>
              Think sharp.
              <br />
              <span>Play smarter.</span>
            </h1>

            <p>
              Challenge your mind with a logic puzzle.
              Connect the numbers, avoid the bombs and complete
              the grid.
            </p>

            <button
              className="primary-btn"
              onClick={startDailyChallenge}
              disabled={loadingGame}
            >
              {loadingGame ? "Loading puzzle..." : "Play Daily Challenge →"}
            </button>

            <div className="hero-stats">
              <div>
                <strong>04</strong>
                <span>Daily modes</span>
              </div>
              <div>
                <strong>∞</strong>
                <span>Ways to improve</span>
              </div>
              <div>
                <strong>100%</strong>
                <span>Brain power</span>
              </div>
            </div>
          </div>

          <div className="hero-art">
            <div className="floating-card">
              <span>DAILY CHALLENGE</span>

              <div className="mini-grid">
                {[1, 0, 0, 2, 0, 0, 3, 0, 0].map((n, i) => (
                  <div
                    key={i}
                    className={
                      n
                        ? "mini-cell numbered"
                        : "mini-cell"
                    }
                  >
                    {n || ""}
                  </div>
                ))}
              </div>

              <p>
                One puzzle. One goal. Think differently.
              </p>
            </div>
          </div>
        </section>

        {/* Mode Selection */}
        <section className="how-section" id="modes">
          <span className="eyebrow">CHOOSE YOUR GAME</span>
          <h2>Play your way</h2>

          <div className="steps">
            <div>
              <span>DAILY</span>
              <h3>Daily Challenge</h3>
              <p>
                Jump straight into the 6×6 Challenge puzzle.
              </p>
              <button
                className="primary-btn"
                onClick={startDailyChallenge}
                disabled={loadingGame}
              >
                {loadingGame ? "Loading puzzle..." : "Start Challenge →"}
              </button>
            </div>

            <div>
              <span>PRACTICE</span>
              <h3>Easy · 3×3</h3>
              <p>Learn the basics with a smaller grid.</p>
              <button
                className="reset-btn"
                onClick={() => startPractice("Easy")}
                disabled={loadingGame}
              >
                Play Easy
              </button>
            </div>

            <div>
              <span>PRACTICE</span>
              <h3>Medium · 4×4</h3>
              <p>Build your route-planning skills.</p>
              <button
                className="reset-btn"
                onClick={() => startPractice("Medium")}
                disabled={loadingGame}
              >
                Play Medium
              </button>
            </div>

            <div>
              <span>PRACTICE</span>
              <h3>Hard · 5×5</h3>
              <p>Take on a more demanding puzzle.</p>
              <button
                className="reset-btn"
                onClick={() => startPractice("Hard")}
                disabled={loadingGame}
              >
                Play Hard
              </button>
            </div>
          </div>
        </section>

        {/* Game Section */}
        <section className="game-section" id="play">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {gameMode === "daily"
                  ? "DAILY CHALLENGE"
                  : "PRACTICE MODE"}
              </span>

              <h2>Ready to think?</h2>

              <p>
                Connect the playable cells and avoid the bombs.
              </p>
            </div>

            <span className="date-label">MINDGRID</span>
          </div>

          <div className="game-layout">
            <div className="game-card">
              <div className="game-top">
                <div>
                  <span className="game-label">
                    PUZZLE {puzzle.id || "DAILY"}
                  </span>
                  <h3>Number Path</h3>
                </div>

                <span className="difficulty">
                  {difficulty}
                </span>
              </div>

              <div className="rules-panel">
                <h3>📖 How to Play</h3>

                <ul>
                  <li>
                    Start at number 1 and move to an adjacent cell.
                  </li>
                  <li>
                    💣 Bomb cells are blocked. Do not select or cross them.
                  </li>
                  <li>
                    Visit checkpoints X, Y and Z in their displayed order.
                  </li>
                  <li>
                    Every playable cell must be visited exactly once.
                  </li>
                  <li>
                    Finish at the final cell to complete the puzzle.
                  </li>
                  <li>
                    Undo is available in Easy and Medium only. {difficulty === "Challenge" && "Challenge earns +10 per filled cell and loses 10 points per bomb selected; each bomb also removes the last 2 filled cells."}
                  </li>
                </ul>
              </div>

              <div className="game-stats">
                <div>
                  <span>TIME</span>
                  <strong>{formatTime(elapsed)}</strong>
                </div>

                <div>
                  <span>PROGRESS</span>
                  <strong>
                    {path.length}/{TOTAL_CELLS}
                  </strong>
                </div>
              </div>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${
                      (path.length / TOTAL_CELLS) * 100
                    }%`,
                  }}
                />
              </div>

              <div
                className="grid-board"
                style={{
                  gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))`,
                }}
              >
                {renderGrid()}
              </div>

              <p
                className={`game-message ${
                  bombHit !== null ? "bomb-warning" : ""
                }`}
                aria-live="polite"
              >
                {message}
              </p>

              {/* Successful Completion */}
              {completed && (
                <div className="completion-card">
                  <h3>🎉 Puzzle completed!</h3>
                  <p>Your score: {score} points</p>
                  <p>
                    Completion time: {formatTime(elapsed)}
                  </p>
                  <p>{WIN_MESSAGES[difficulty]}</p>
                </div>
              )}

              {/* Dead End Result */}
              {failed && (
                <div className="completion-card">
                  {difficulty === "Challenge" ? (
                    <>
                      <h3>🏁 Challenge Attempt Ended</h3>
                      <p>
                        Correct cells: {path.length}
                      </p>
                      <p>Bombs selected: {challengeBombsSelected}</p>
                      <p>Cell points: {path.length * CHALLENGE_POINTS_PER_CELL}</p>
                      <p>Bomb penalty: −{challengeBombsSelected * CHALLENGE_POINTS_PER_CELL} points</p>
                      <p>
                        Final Challenge score: {" "}
                        <strong>{score} points</strong>
                      </p>
                      <p>Score is filled-cell points minus 10 points per bomb selection, with a minimum of 0. Each bomb also removes the last 2 filled cells.</p>
                    </>
                  ) : (
                    <>
                      <h3>🔄 No Route Remaining</h3>
                      <p>
                        This route cannot be completed anymore.
                      </p>
                      <p>
                        Try a different path in a new puzzle.
                      </p>
                      <button
                        className="primary-btn"
                        onClick={restartAfterFailure}
                      >
                        Restart Game
                      </button>
                    </>
                  )}
                </div>
              )}

              {!completed && !failed && (
                <div className="game-actions">
                  {canUndo && (
                    <button
                      className="reset-btn"
                      onClick={undoMove}
                      disabled={path.length === 0}
                      title="Undo your last move"
                    >
                      ↶ Undo
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Mission */}
            <aside className="info-card">
              <span className="eyebrow">YOUR MISSION</span>
              <h3>Complete the path.</h3>

              <p>
                Connect all {TOTAL_CELLS} playable cells using one
                continuous path. Avoid bombs and visit checkpoints
                in order.
              </p>

              <div className="mission-item">
                <span>01</span>
                <p>Start at number 1.</p>
              </div>

              {checkpointOrder.map((letter, index) => (
                <div
                  className="mission-item"
                  key={letter}
                >
                  <span>0{index + 2}</span>
                  <p>Reach checkpoint {letter}.</p>
                </div>
              ))}

              <div className="mission-item">
                <span>END</span>
                <p>Finish at number {TOTAL_CELLS}.</p>
              </div>

              <label htmlFor="difficulty">
                Practice difficulty
              </label>

              <select
                id="difficulty"
                value={difficulty}
                onChange={handleDifficultyChange}
              >
                <option value="Easy">Easy · 3×3</option>
                <option value="Medium">Medium · 4×4</option>
                <option value="Hard">Hard · 5×5</option>
                <option value="Challenge">
                  Challenge · 6×6
                </option>
              </select>

              <p className="difficulty-note">
                Current grid: {puzzle.size}×{puzzle.size}
              </p>

              <p className="difficulty-note">
                Playable cells: {TOTAL_CELLS} · Blocked cells:{" "}
                {puzzle.blockedCells.length}
              </p>

              {!canUndo && (
                <p className="difficulty-note">
                  Undo is disabled in this mode.
                </p>
              )}
            </aside>
          </div>
        </section>

        {/* How to Play */}
        <section className="how-section" id="how-to-play">
          <span className="eyebrow">SIMPLE TO LEARN</span>
          <h2>How to play</h2>

          <div className="steps">
            <div>
              <span>01</span>
              <h3>Find the start</h3>
              <p>Begin at the cell marked 1.</p>
            </div>

            <div>
              <span>02</span>
              <h3>Plan your route</h3>
              <p>
                Move to adjacent playable cells. Avoid bombs and
                visit checkpoints in order.
              </p>
            </div>

            <div>
              <span>03</span>
              <h3>Complete the puzzle</h3>
              <p>
                Visit every playable cell exactly once and reach
                the final cell.
              </p>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="about-section" id="about">
          <div className="about-header">
            <span className="eyebrow">BEHIND THE GRID</span>
            <h2>About</h2>
          </div>

          <div className="about-grid">
            <div className="about-card">
              <span className="about-badge">
                <span className="about-badge-icon">◈</span>
                THE GAME
              </span>
              <h3>About MindGrid</h3>
              <p>
                MindGrid is a logic-based puzzle game built around the idea that every move matters. It challenges players to think ahead, recognize patterns, plan their routes, and solve problems through logic rather than guesswork.
              </p>
              <p>
                With daily challenges and multiple practice difficulties, MindGrid brings together learning, strategy, and challenge in one experience. Whether you&apos;re practicing at your own pace or tackling the daily challenge, every puzzle is an opportunity to sharpen your thinking.
              </p>
              <blockquote className="about-quote">
                &quot;Think ahead. Find your path. Make every move count.&quot;
              </blockquote>
            </div>

            <div className="about-card">
              <span className="about-badge">
                <span className="about-badge-icon">✦</span>
                THE CREATOR
              </span>
              <h3>About the Creator</h3>
              <p>
                MindGrid was created by a student developer passionate about technology, problem-solving, and building interactive digital experiences. The project combines game logic, frontend development, backend systems, and puzzle design into one real-world application.
              </p>
              <p>
                The goal behind MindGrid is simple: create something engaging, challenging, and different—an experience that encourages players to think, experiment, and improve.
              </p>
              <blockquote className="about-quote">
                &quot;Built with curiosity. Driven by logic. Created to challenge minds.&quot;
              </blockquote>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer>
        <a className="logo" href="#">
          <span className="logo-icon">M</span>
          MindGrid
        </a>

        <p>Think differently. One puzzle at a time.</p>

        <span>© 2026 MindGrid. All rights reserved.</span>
      </footer>

      {/* Authentication */}
      {showAuth && (
        <Auth
          onClose={() => setShowAuth(false)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}

export default App;
