
const mongoose = require("mongoose");

const dailyPuzzleSchema = new mongoose.Schema(
  {
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true
    },

    mode: {
      type: String,
      required: true,
      enum: ["Easy", "Medium", "Hard", "Challenge"]
    },

    size: {
      type: Number,
      required: true,
      min: 3,
      max: 6
    },

    startCell: {
      type: Number,
      required: true,
      min: 0
    },

    finishCell: {
      type: Number,
      required: true,
      min: 0
    },

    playableCells: {
      type: [Number],
      required: true
    },

    blockedCells: {
      type: [Number],
      default: []
    },

    checkpoints: {
      type: [
        {
          label: {
            type: String,
            enum: ["X", "Y", "Z"],
            required: true
          },
          cell: {
            type: Number,
            required: true
          },
          order: {
            type: Number,
            required: true
          }
        }
      ],
      default: []
    },

    // Keep official routes private. Never return this field
    // through public puzzle API responses.
    verifiedSolutions: {
      type: [[Number]],
      required: true,
      select: false
    },

    totalPlayable: {
      type: Number,
      required: true,
      min: 1
    },

    verifiedRouteCount: {
      type: Number,
      required: true,
      min: 1
    },

    verified: {
      type: Boolean,
      default: false,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Exactly one official puzzle per mode per Pacific calendar day.
dailyPuzzleSchema.index(
  { dateKey: 1, mode: 1 },
  { unique: true }
);

module.exports = mongoose.model("DailyPuzzle", dailyPuzzleSchema);
