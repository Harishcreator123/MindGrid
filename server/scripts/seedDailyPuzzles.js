require("dotenv").config();

const mongoose = require("mongoose");
const {
  getPacificDateKey,
  ensureDailyPuzzleForDate
} = require("../services/dailyPuzzleService");

const MODES = ["Easy", "Medium", "Hard", "Challenge"];

async function seedDailyPuzzles() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing.");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected.");

    const dateKey = getPacificDateKey();

    console.log(`Generating puzzles for ${dateKey} (Pacific Time)`);

    for (const mode of MODES) {
      console.log(`${mode}: checking history and generating if needed...`);
      const puzzle = await ensureDailyPuzzleForDate(mode, dateKey);

      console.log(
        `${mode}: ready with ${puzzle.verifiedRouteCount} verified route(s).`
      );
    }

    console.log("Daily puzzle seeding finished.");
  } catch (error) {
    console.error("Daily puzzle seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedDailyPuzzles();