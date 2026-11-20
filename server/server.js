
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const authRoutes = require("./routes/authRoutes");
const gameRoutes = require("./routes/gameRoutes");

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "20kb" }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to MindGrid API!",
    status: "Server is running",
  });
});

// Connect to MongoDB before accepting requests
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing.");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing.");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected database name:", mongoose.connection.name);

    console.log("MongoDB connected successfully!");

    app.listen(PORT, () => {
      console.log(
        `MindGrid server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "MindGrid server startup failed:",
      error.message
    );

    process.exit(1);
  }
}

startServer();
