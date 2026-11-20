
import { useState } from "react";

function Auth({ onClose, onSuccess }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const endpoint =
        mode === "register" ? "register" : "login";

      const response = await fetch(
        `http://localhost:5000/api/auth/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...(mode === "register" && { name }),
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Authentication failed.");
      }

      onSuccess(data);

      setMessage(data.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <button
          type="button"
          className="auth-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <span className="eyebrow">WELCOME TO MINDGRID</span>

        <h2>
          {mode === "login" ? "Welcome back!" : "Create account"}
        </h2>

        <p>
          {mode === "login"
            ? "Sign in to continue your puzzle journey."
            : "Join MindGrid and start your daily challenge."}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Full name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                minLength={2}
                maxLength={50}
                required
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              minLength={8}
              maxLength={128}
              required
            />
          </label>

          {message && (
            <p className="auth-message" role="alert">
              {message}
            </p>
          )}

          <button
            type="submit"
            className="primary-btn auth-submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "login"
            ? "Don't have an account?"
            : "Already have an account?"}

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setMessage("");
            }}
          >
            {mode === "login" ? " Register" : " Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default Auth;
