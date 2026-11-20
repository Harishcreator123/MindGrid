require("dotenv").config();

const mongoose = require("mongoose");
const DailyPuzzle = require("../models/DailyPuzzle");
const {
  getPacificDateKey
} = require("../services/dailyPuzzleService");
const {
  generateDailyPuzzle
} = require("../generators/puzzleGenerator");

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
      const existing = await DailyPuzzle.findOne({
        dateKey,
        mode
      });

      if (existing) {
        console.log(`${mode}: already exists. Skipping.`);
        continue;
      }

      console.log(`${mode}: generating and verifying...`);

      const puzzle = generateDailyPuzzle(mode, dateKey);

      await DailyPuzzle.create(puzzle);

      console.log(
        `${mode}: saved with ${puzzle.verifiedRouteCount} verified route(s).`
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