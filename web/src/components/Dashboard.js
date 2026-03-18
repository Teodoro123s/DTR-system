import React, { useState, useEffect } from 'react';
import axios from 'axios';
import StudentManagement from './StudentManagement';
import DTRManagement from './DTRManagement';
import './Dashboard.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function Dashboard({ user, setUser }) {
  const [activeTab, setActiveTab] = useState('students');

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <div className="dashboard-container">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-left">
          <h1 className="navbar-title">📋 DTR System</h1>
        </div>
        <div className="navbar-right">
          <span className="user-info">👤 {user.firstName} {user.lastName}</span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </nav>

      {/* Main Layout */}
      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-menu">
            <button 
              className={`menu-item ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => setActiveTab('students')}
            >
              👥 Students
            </button>
            <button 
              className={`menu-item ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              ⏳ Pending Tickets
            </button>
            <button 
              className={`menu-item ${activeTab === 'approved' ? 'active' : ''}`}
              onClick={() => setActiveTab('approved')}
            >
              ✅ Approved Records
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="main-content">
          <div className="content-header">
            {activeTab === 'students' && <h2>Student Management</h2>}
            {activeTab === 'pending' && <h2>Pending Tickets to Review</h2>}
            {activeTab === 'approved' && <h2>Approved DTR Records</h2>}
          </div>
          <div className="content-body">
            {activeTab === 'students' && <StudentManagement />}
            {activeTab === 'pending' && <DTRManagement lockedStatus="pending" />}
            {activeTab === 'approved' && <DTRManagement lockedStatus="approved" />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;