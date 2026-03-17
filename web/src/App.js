import React, { useState } from 'react';
import './App.css';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));

  return (
    <div className="App">
      {user ? <Dashboard user={user} setUser={setUser} /> : <Login setUser={setUser} />}
    </div>
  );
}

export default App;