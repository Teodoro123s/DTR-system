import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function Login({ setUser }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const canSubmit = username.trim() && password.trim();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!canSubmit) {
      setError('Please enter username and password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API_URL}/login`, { username, password });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      setUser(response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login-container">
        <p className="login-kicker">Attendance Platform</p>
        <h1>DTR System</h1>
        <p className="login-subtitle">Sign in to manage students, pending requests, and attendance records.</p>
        <form onSubmit={handleLogin}>
          <div className="login-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="login-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading || !canSubmit}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export default Login;