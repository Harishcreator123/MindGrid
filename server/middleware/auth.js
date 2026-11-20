
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    // Read the token from the Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Please sign in to continue.",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing.",
      });
    }

    // Verify the token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // Find the account associated with the token
    const user = await User.findById(decoded.id).select(
      "_id name email"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account not found. Please sign in again.",
      });
    }

    // Attach authenticated user to the request
    req.user = user;

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Your session is invalid or expired. Please sign in again.",
    });
  }
};

module.exports = protect;
