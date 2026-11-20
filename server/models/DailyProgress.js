
const mongoose = require("mongoose");

const modeProgressSchema = new mongoose.Schema(
  {
    // Number of attempts made in this mode today
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    // available, in_progress, failed or completed
    status: {
      type: String,
      enum: [
        "available",
        "in_progress",
        "failed",
        "completed",
      ],
      default: "available",
    },

    // Best score achieved in this mode today
    bestScore: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Score from the latest attempt
    lastScore: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Current route, allowing a Challenge to resume
    // if the player refreshes the page
    currentPath: {
      type: [Number],
      default: [],
    },

    // Time spent in the current attempt
    elapsedSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Time taken to complete the puzzle
    completionTime: {
      type: Number,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const dailyProgressSchema = new mongoose.Schema(
  {
    // Player account
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Daily date key calculated using Pacific Time
    // Example: 2026-11-18
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    // One record contains all four daily modes
    modes: {
      Easy: {
        type: modeProgressSchema,
        default: () => ({}),
      },

      Medium: {
        type: modeProgressSchema,
        default: () => ({}),
      },

      Hard: {
        type: modeProgressSchema,
        default: () => ({}),
      },

      Challenge: {
        type: modeProgressSchema,
        default: () => ({}),
      },
    },
  },
  {
    timestamps: true,
  }
);

// A player can have only one progress record per daily puzzle date.
dailyProgressSchema.index(
  {
    user: 1,
    dateKey: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "DailyProgress",
  dailyProgressSchema
);
