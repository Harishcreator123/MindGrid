
import { useState, useEffect, useRef } from "react";
import {
  generatePuzzle,
  validatePath,
  canCompletePath,
} from "./gameEngine";
import Auth from "./Auth";
import { startGame as startServerGame, failGame, completeGame, getTodayProgress } from "./api";
import "./App.css";

const DIFFICULTIES = {
  Easy: { size: 3, undo: true },
  Medium: { size: 4, undo: true },
  Hard: { size: 5, undo: false },
  Challenge: { size: 6, undo: false },
};

const WIN_MESSAGES = {
  Easy: "Fantastic! Today's Easy puzzle is complete. Come back tomorrow for a fresh one!",
  Medium: "Brilliant work! You've conquered Medium. A new puzzle awaits tomorrow!",
  Hard: "Outstanding! You've mastered Hard. See you tomorrow for another challenge!",
  Challenge: "MindGrid Champion! Today's Challenge is complete. Your streak continues!",
};

const CHALLENGE_POINTS_PER_CELL = 10;

function LineIcon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    gamepad: <><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01" /><rect x="3" y="7" width="18" height="10" rx="4" /></>,
    leaf: <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5.1 18.5 2 18.5 2c1 4.5-.5 10.5-5.5 13.5C10.7 17 9 18 7 18" /><path d="M2 21c1.5-5 5-9 11-12" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    mountain: <><path d="m3 20 6-10 4 6 3-4 5 8H3Z" /><path d="m9 10 2-3 2 3" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h3a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3" /></>,
    bomb: <><circle cx="13" cy="13" r="7" /><path d="M18.5 7.5 21 5M17 5l4 4M5.5 20.5l2-2" /></>,
    chart: <><path d="M3 3v18h18M7 16l4-5 4 3 5-7" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
  };

  return (
    <svg
      aria-hidden="true"
      className="line-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

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
  const [challengeCorrectCells, setChallengeCorrectCells] = useState(0);
  const [challengeIncorrectCells, setChallengeIncorrectCells] = useState(0);
  const [challengeLocked, setChallengeLocked] = useState(false);
  const [challengeLockModal, setChallengeLockModal] = useState(false);
  const [challengeResult, setChallengeResult] = useState(null);
  const [message, setMessage] = useState(
    "Start by selecting number 1."
  );

  const [showAuth, setShowAuth] = useState(false);
  const [loadingGame, setLoadingGame] = useState(false);
  const [pendingGame, setPendingGame] = useState(null);
  const [serverPuzzleValidated, setServerPuzzleValidated] = useState(false);
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
  // Refs for scrolling
  const gridRef = useRef(null);
  const resultRef = useRef(null);
  const modeSwitchInFlight = useRef(false);

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
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  useEffect(() => {
    if (!currentUser) return;

    getTodayProgress()
      .then((progress) => {
        const challenge = progress.modes?.Challenge;
        setChallengeLocked(Boolean(
          challenge &&
          (challenge.status === "completed" ||
            challenge.status === "failed" ||
            (challenge.attempts >= 1 && challenge.status !== "in_progress"))
        ));
      })
      .catch(() => {
        setChallengeLocked(false);
      });
  }, [currentUser]);

  useEffect(() => {
    if (!started || completed || failed) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsed((previous) => previous + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [started, completed, failed]);

  useEffect(() => {
    if (!completed && !failed) return;

    resultRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [completed, failed]);

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
    setChallengeLocked(false);
    setChallengeLockModal(false);
    setMessage("You have signed out successfully.");
  };

  const resetGameState = () => {
    setPath([]);
    setElapsed(0);
    setCompleted(false);
    setFailed(false);
    setScore(0);
    setChallengeBombsSelected(0);
    setChallengeCorrectCells(0);
    setChallengeIncorrectCells(0);
    setChallengeResult(null);
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

    if (selected === "Challenge" && challengeLocked) {
      setChallengeLockModal(true);
      return;
    }

    if (modeSwitchInFlight.current) return;

    modeSwitchInFlight.current = true;
    setLoadingGame(true);
    setMessage("Loading today's official puzzle...");

    try {
      const result = await startServerGame(selected);
      const nextPuzzle = result.puzzle;
      const savedProgress = result.modeProgress || {};

      setDifficulty(selected);
      setGameMode(selectedMode);
      setPuzzle(nextPuzzle);
      setServerPuzzleValidated(true);
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
      } else if (error.locked) {
        setChallengeLocked(true);
        setChallengeLockModal(true);
      }
      setMessage(error.message || "Unable to load today's puzzle. Please try again.");
    } finally {
      modeSwitchInFlight.current = false;
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
      setMessage("Bomb hit. Think ahead. Your last 2 filled cells were removed and 10 points deducted. Try different cells.");
    } else if (difficulty === "Hard") {
      setPath((previous) =>
        previous.slice(0, Math.max(0, previous.length - 2))
      );
      setMessage("Bomb hit. Think ahead. Your last 2 filled cells were removed. Try different cells.");
    } else {
      setMessage("Bomb hit. Think ahead. Blocked cell; no penalty. Try different cells.");
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
      const bombPenalty = challengeBombsSelected * CHALLENGE_POINTS_PER_CELL;

      failGame(difficulty, updatedPath, elapsed)
        .then((result) => {
          const correctCells = Number.isInteger(result.correctCells)
            ? result.correctCells
            : 0;
          const incorrectCells = Number.isInteger(result.incorrectCells)
            ? result.incorrectCells
            : Math.max(0, updatedPath.length - correctCells);
          const basePoints = correctCells * CHALLENGE_POINTS_PER_CELL;

          setChallengeCorrectCells(correctCells);
          setChallengeIncorrectCells(incorrectCells);
          setScore(Math.max(0, basePoints - bombPenalty));
        })
        .catch((error) => {
          console.error("Challenge result calculation failed:", error);
          setChallengeCorrectCells(0);
          setChallengeIncorrectCells(updatedPath.length);
          setScore(Math.max(0, -bombPenalty));
        });

      setChallengeCorrectCells(0);
      setChallengeIncorrectCells(updatedPath.length);
      setScore(Math.max(0, -bombPenalty));

      setMessage(
        "Challenge attempt ended. Calculating the verified result."
      );
    } else {
      setScore(0);

      setMessage(
        "No complete route remains. Restart the game and try a different path."
      );
    }
  };

  const handleCellClick = (index) => {
    if (!serverPuzzleValidated) {
      changeDifficulty(difficulty, gameMode);
      return;
    }

    if (completed || failed) return;

    if (puzzle.blockedCells.includes(index)) {
      handleBombClick(index);
      return;
    }

    if (path.includes(index)) {
      setMessage("Every move is a lesson. Think again. Find your path.");
      return;
    }

    if (path.length === 0) {
      if (index !== startCell) {
        setMessage("Start your journey at number 1.");
        return;
      }

      const firstPath = [index];
      setPath(firstPath);

      const grid = gridRef.current;
      if (grid) {
        const gridRect = grid.getBoundingClientRect();
        const viewportCenter = window.innerHeight / 2;
        const gridCenter = gridRect.top + gridRect.height / 2;
        const centerTolerance = window.innerHeight * 0.1;

        if (Math.abs(gridCenter - viewportCenter) > centerTolerance) {
          grid.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
      }

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
      setMessage("Stay connected. Choose a neighboring cell.");
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
        setMessage("Every move is a lesson. Think again. Find your path.");
        return;
      }
    }

    if (
      index === finishCell &&
      path.length !== TOTAL_CELLS - 1
    ) {
      setMessage("Every move is a lesson. Think again. Find your path.");
      return;
    }

    if (
      path.length >= TOTAL_CELLS - 1 &&
      index !== finishCell
    ) {
      setMessage("Every move is a lesson. Think again. Find your path.");
      return;
    }

    const updatedPath = [...path, index];

    // Check for a successful complete route first.
    if (index === finishCell) {
      if (
        updatedPath.length !== TOTAL_CELLS ||
        !validatePath(updatedPath, puzzle)
      ) {
        setMessage("Every move is a lesson. Think again. Find your path.");
        return;
      }

      setPath(updatedPath);

      const timeScore = Math.max(100, 1000 - elapsed * 5);
      const finalScore = difficulty === "Challenge"
        ? Math.max(0, timeScore - challengeBombsSelected * CHALLENGE_POINTS_PER_CELL)
        : timeScore;

      setScore(finalScore);

      if (difficulty === "Challenge") {
        setChallengeLocked(true);
        setChallengeCorrectCells(TOTAL_CELLS);
        setChallengeIncorrectCells(0);
        setChallengeResult({
          score: finalScore,
          cellPoints: TOTAL_CELLS * CHALLENGE_POINTS_PER_CELL,
          bombPenalty: challengeBombsSelected * CHALLENGE_POINTS_PER_CELL,
          bombsSelected: challengeBombsSelected,
          correctCells: TOTAL_CELLS,
        });

        completeGame(difficulty, updatedPath, elapsed, challengeBombsSelected)
          .then((result) => {
            const cellPoints = TOTAL_CELLS * CHALLENGE_POINTS_PER_CELL;
            const bombPenalty = (result.bombPenalty ??
              challengeBombsSelected * CHALLENGE_POINTS_PER_CELL);

            setScore(result.score);
            setChallengeResult({
              score: result.score,
              cellPoints,
              bombPenalty,
              bombsSelected: result.bombsSelected ?? challengeBombsSelected,
              correctCells: result.correctCells ?? TOTAL_CELLS,
            });
          })
          .catch((error) => {
            console.error("Challenge completion record failed:", error);
          });
      }

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
          cellContent = "";
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
            {isBlocked && (
              <LineIcon name="bomb" size={15} />
            )}
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
        <a className="logo" href="#" aria-label="MindGrid home">
          <span className="logo-icon"><LineIcon name="grid" size={21} /></span>
          <span>MindGrid</span>
        </a>

        <div className="nav-links">
          <a href="#play"><LineIcon name="play" size={15} />Play</a>
          <a href="#how-to-play">How to Play</a>
          <a href="#about">About</a>
        </div>

        {currentUser ? (
          <div className="user-menu">
            <span>Hi, {currentUser.name}</span>
            <button className="login-btn" onClick={handleLogout}>Sign Out</button>
          </div>
        ) : (
          <button className="login-btn" onClick={() => setShowAuth(true)}>Sign In</button>
        )}

        <div className="mobile-nav" aria-label="Mobile navigation">
          <a href="#play"><LineIcon name="play" size={16} /><span>Play</span></a>
          <a href="#how-to-play"><LineIcon name="route" size={16} /><span>Rules</span></a>
          <a href="#about"><LineIcon name="grid" size={16} /><span>About</span></a>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="hero-content">
            <span className="eyebrow">YOUR DAILY BRAIN CHALLENGE</span>

            <h1>Your mind. Your move.</h1>

            <p className="hero-support">
              Think ahead. Find the path. Connect every cell.
            </p>

            <div className="hero-actions">
              <button
                className="primary-btn"
                onClick={startDailyChallenge}
                disabled={loadingGame}
              >
                <LineIcon name="play" size={17} />
                {loadingGame ? "Loading puzzle..." : challengeLocked ? "Locked Today" : "Play Daily Challenge"}
              </button>
              <button
                className="secondary-btn"
                onClick={() => document.getElementById("practice")?.scrollIntoView({ behavior: "smooth" })}
              >
                <LineIcon name="gamepad" size={18} />Practice
              </button>
            </div>

            <div className="hero-features" aria-label="Game principles">
              <div><LineIcon name="target" size={19} /><span>Plan</span></div>
              <div><LineIcon name="route" size={19} /><span>Solve</span></div>
              <div><LineIcon name="chart" size={19} /><span>Improve</span></div>
            </div>
          </div>

          <div className="hero-art" aria-label="Decorative connected puzzle grid">
            <div className="hero-grid-card">
              <div className="hero-grid-heading">
                <span>DAILY GRID</span>
                <span>6 × 6</span>
              </div>
              <div className="hero-grid">
                {Array.from({ length: 36 }, (_, index) => {
                  const start = index === 0;
                  const end = index === 35;
                  const bomb = [4, 9, 11, 16, 20, 24, 29, 31].includes(index);
                  const path = [0, 1, 2, 8, 14, 15, 21, 27, 33, 34, 35].includes(index);
                  return (
                    <span
                      key={index}
                      className={`hero-grid-cell${start ? " start" : ""}${end ? " end" : ""}${bomb ? " bomb" : ""}${path ? " path" : ""}`}
                    >
                      {start ? "1" : end ? "36" : bomb ? "" : ""}
                    </span>
                  );
                })}
              </div>
              <div className="hero-grid-caption">
                <span><i className="caption-dot start-dot" />Start</span>
                <span><i className="caption-dot path-dot" />Path</span>
                <span><i className="caption-dot blocked-dot" />Blocked</span>
              </div>
            </div>
          </div>
        </section>

        {/* Daily Challenge Spotlight */}
        <section className="daily-section" id="modes">
          <div className="daily-card">
            <div className="daily-info">
              <span className="daily-icon"><LineIcon name="calendar" size={24} /></span>
              <div>
                <span className="section-kicker">TODAY'S PUZZLE</span>
                <h2>Daily Challenge</h2>
                <p>Today's official puzzle. A fresh challenge every day.</p>
                <time>{todayLabel}</time>
              </div>
            </div>

            <div className="daily-preview" aria-label="Decorative puzzle grid preview">
              <div className="preview-grid">
                {Array.from({ length: 36 }, (_, index) => {
                  const previewStart = index === 0;
                  const previewEnd = index === 35;
                  const previewBomb = [3, 8, 15, 22, 27, 32].includes(index);
                  const previewPath = [0, 1, 7, 13, 14, 20, 26, 33, 34].includes(index);
                  return (
                    <span
                      key={index}
                      className={`preview-cell${previewStart ? " preview-start" : ""}${previewEnd ? " preview-end" : ""}${previewBomb ? " preview-bomb" : ""}${previewPath ? " preview-path" : ""}`}
                    >
                      {previewStart ? "1" : previewEnd ? "36" : ""}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="daily-action">
              <button
                className="primary-btn daily-play-btn"
                onClick={startDailyChallenge}
                disabled={loadingGame}
              >
                <LineIcon name="play" size={18} />
                {loadingGame ? "Loading puzzle..." : challengeLocked ? "Locked Today" : "Play Now"}
              </button>
            </div>
          </div>
        </section>

        {/* Practice */}
        <section className="practice-section" id="practice">
          <div className="practice-heading">
            <span className="eyebrow">PRACTICE MODE</span>
            <h2>Practice your skills</h2>
            <p>Play at your own pace.</p>
          </div>

          <div className="practice-grid">
            <article className="practice-card">
              <div className="practice-card-icon"><LineIcon name="leaf" size={22} /></div>
              <div className="practice-card-copy">
                <span className="practice-label">BEGINNER</span>
                <h3>Easy</h3>
                <p>A gentle start to build your logic.</p>
                <span className="grid-size">3 × 3 GRID</span>
              </div>
              <button className="practice-arrow" onClick={() => startPractice("Easy")} disabled={loadingGame} aria-label="Play Easy practice">
                <LineIcon name="play" size={18} />
              </button>
            </article>

            <article className="practice-card">
              <div className="practice-card-icon"><LineIcon name="layers" size={22} /></div>
              <div className="practice-card-copy">
                <span className="practice-label">INTERMEDIATE</span>
                <h3>Medium</h3>
                <p>A balanced challenge.</p>
                <span className="grid-size">4 × 4 GRID</span>
              </div>
              <button className="practice-arrow" onClick={() => startPractice("Medium")} disabled={loadingGame} aria-label="Play Medium practice">
                <LineIcon name="play" size={18} />
              </button>
            </article>

            <article className="practice-card">
              <div className="practice-card-icon"><LineIcon name="mountain" size={22} /></div>
              <div className="practice-card-copy">
                <span className="practice-label">ADVANCED</span>
                <h3>Hard</h3>
                <p>A tougher test for sharp minds.</p>
                <span className="grid-size">5 × 5 GRID</span>
              </div>
              <button className="practice-arrow" onClick={() => startPractice("Hard")} disabled={loadingGame} aria-label="Play Hard practice">
                <LineIcon name="play" size={18} />
              </button>
            </article>
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
                <h3>How to Play</h3>

                <ul>
                  <li>
                    Start at number 1 and move to an adjacent cell.
                  </li>
                  <li>
                    Bomb cells are blocked. Do not select or cross them.
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
                ref={gridRef}
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
                <div className="completion-card" ref={resultRef}>
                  {difficulty === "Challenge" ? (
                    <>
                      <h3>Challenge Completed</h3>
                      <p>Correct cells: {challengeResult?.correctCells ?? TOTAL_CELLS}</p>
                      <p>Bombs selected: {challengeResult?.bombsSelected ?? challengeBombsSelected}</p>
                      <p>Cell points: {challengeResult?.cellPoints ?? TOTAL_CELLS * CHALLENGE_POINTS_PER_CELL}</p>
                      <p>Bomb penalty: −{challengeResult?.bombPenalty ?? challengeBombsSelected * CHALLENGE_POINTS_PER_CELL} points</p>
                      <p>Final Challenge score: <strong>{challengeResult?.score ?? score} points</strong></p>
                      <p>Completion time: {formatTime(elapsed)}</p>
                    </>
                  ) : (
                    <>
                      <h3>Puzzle completed.</h3>
                      <p>Your score: {score} points</p>
                      <p>Completion time: {formatTime(elapsed)}</p>
                      <p>{WIN_MESSAGES[difficulty]}</p>
                    </>
                  )}
                </div>
              )}

              {/* Dead End Result */}
              {failed && (
                <div className="completion-card" ref={resultRef}>
                  {difficulty === "Challenge" ? (
                    <>
                      <h3>Challenge Attempt Ended</h3>
                      <p>Correct cells: {challengeCorrectCells}</p>
                      <p>Incorrect cells: {challengeIncorrectCells}</p>
                      <p>Bombs selected: {challengeBombsSelected}</p>
                      <p>Cell points: {challengeCorrectCells * CHALLENGE_POINTS_PER_CELL}</p>
                      <p>Bomb penalty: −{challengeBombsSelected * CHALLENGE_POINTS_PER_CELL} points</p>
                      <p>
                        Final Challenge score: {" "}
                        <strong>{score} points</strong>
                      </p>
                      <p>Score is correct-cell points minus 10 points per bomb selection, with a minimum of 0. Each bomb also removes the last 2 filled cells.</p>
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
                <span className="about-badge-icon"><LineIcon name="grid" size={12} /></span>
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
                <span className="about-badge-icon"><LineIcon name="route" size={12} /></span>
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
        <div className="footer-line" />
        <p>Every move matters.</p>
        <div className="footer-line" />
      </footer>

      {challengeLockModal && (
        <div className="lock-overlay" role="presentation">
          <div className="lock-modal" role="dialog" aria-modal="true" aria-labelledby="challenge-lock-title">
            <button
              type="button"
              className="lock-close"
              aria-label="Close"
              onClick={() => setChallengeLockModal(false)}
            >
              ×
            </button>
            <div className="lock-icon"><LineIcon name="calendar" size={22} /></div>
            <h2 id="challenge-lock-title">Challenge Locked</h2>
            <p>
              You've already used today's Challenge attempt. One attempt is allowed per day. Come back tomorrow for a fresh challenge.
            </p>
            <button
              type="button"
              className="primary-btn lock-action"
              onClick={() => setChallengeLockModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

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
