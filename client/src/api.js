
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

async function apiRequest(endpoint, options = {}) {
  const token = sessionStorage.getItem("mindgridToken");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.message || `Request failed (${response.status}).`
    );
    error.status = response.status;
    error.locked = data.locked || false;
    throw error;
  }

  return data;
}

const normalizePuzzle = (puzzle) => {
  if (
    !puzzle ||
    !Array.isArray(puzzle.playableCells) ||
    !Array.isArray(puzzle.blockedCells) ||
    !Array.isArray(puzzle.checkpoints)
  ) {
    throw new Error("The server returned an invalid puzzle.");
  }

  const checkpoints = {};

  for (const checkpoint of puzzle.checkpoints) {
    checkpoints[checkpoint.cell] = checkpoint.label;
  }

  return {
    ...puzzle,
    id: puzzle.puzzleId || puzzle.id,
    checkpoints,
  };
};

export async function fetchDailyPuzzle(mode) {
  const data = await apiRequest(
    `/api/game/puzzle/${mode}`
  );

  return normalizePuzzle(data.puzzle);
}

export async function startGame(mode) {
  const data = await apiRequest("/api/game/start", {
    method: "POST",
    body: JSON.stringify({ mode }),
  });

  return {
    ...data,
    puzzle: normalizePuzzle(data.puzzle),
  };
}

export async function getTodayProgress() {
  return apiRequest("/api/game/today");
}

export async function saveGameProgress(
  mode,
  path,
  elapsedSeconds
) {
  return apiRequest("/api/game/save", {
    method: "PUT",
    body: JSON.stringify({
      mode,
      path,
      elapsedSeconds,
    }),
  });
}

export async function failGame(
  mode,
  path,
  elapsedSeconds
) {
  return apiRequest("/api/game/fail", {
    method: "POST",
    body: JSON.stringify({
      mode,
      path,
      elapsedSeconds,
    }),
  });
}

export async function completeGame(
  mode,
  path,
  elapsedSeconds
) {
  return apiRequest("/api/game/complete", {
    method: "POST",
    body: JSON.stringify({
      mode,
      path,
      elapsedSeconds,
    }),
  });
}
