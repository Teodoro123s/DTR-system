import React, { useMemo, useState } from 'react';
import StudentManagement from './StudentManagement';
import DTRManagement from './DTRManagement';
import DTRReports from './DTRReports';
import AdminNotifications from './AdminNotifications';
import './Dashboard.css';

function MenuIcon({ type }) {
  if (type === 'students') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 11c1.66 0 3-1.57 3-3.5S17.66 4 16 4s-3 1.57-3 3.5 1.34 3.5 3 3.5Zm-8 0c1.66 0 3-1.57 3-3.5S9.66 4 8 4 5 5.57 5 7.5 6.34 11 8 11Zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.96 1.97 3.45V20h6v-3.5c0-2.33-4.67-3.5-7-3.5Z" />
      </svg>
    );
  }

  if (type === 'pending') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 11h5v-2h-4V7h-2v6h1Z" />
      </svg>
    );
  }

  if (type === 'approved') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm-1.1 14.6-3.5-3.5 1.4-1.4 2.1 2.09 4.3-4.29 1.4 1.4Z" />
      </svg>
    );
  }

  if (type === 'notifications') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a6 6 0 0 0-6 6v3.59L4.29 14.3A1 1 0 0 0 5 16h14a1 1 0 0 0 .71-1.7L18 11.59V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.83-2h-5.66A3 3 0 0 0 12 22Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 12h2v3H7v-3Zm4-6h2v9h-2V9Zm4 3h2v6h-2v-6Z" />
    </svg>
  );
}

function Dashboard({ user, setUser }) {
  const [activeTab, setActiveTab] = useState('students');

  const tabs = useMemo(
    () => [
      { id: 'students', label: 'Students', title: 'Student Management' },
      { id: 'pending', label: 'Pending', title: 'Pending Tickets to Review' },
      { id: 'approved', label: 'Approved', title: 'Approved DTR Records' },
      { id: 'reports', label: 'Reports', title: 'DTR Reports and Student Progress' },
      { id: 'notifications', label: 'Notifications', title: 'Admin Notifications and Activity Alerts' },
    ],
    []
  );

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <div className="dashboard-container">
      <nav className="navbar">
        <div className="navbar-left">
          <p className="navbar-kicker">Attendance Console</p>
          <h1 className="navbar-title">DTR System</h1>
        </div>
        <div className="navbar-right">
          <span className="user-info">{user.firstName} {user.lastName}</span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </nav>
      <div className="main-layout">
        <aside className="sidebar">
          <div className="sidebar-menu">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`menu-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
              >
                <span className="menu-icon" aria-hidden="true"><MenuIcon type={tab.id} /></span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="main-content">
          <div className="content-header">
            <h2>{activeTabMeta.title}</h2>
            <p className="content-subtitle">Manage attendance records with faster workflows and clearer review status.</p>
          </div>
          <div className="content-body">
            {activeTab === 'students' && <StudentManagement />}
            {activeTab === 'pending' && <DTRManagement lockedStatus="pending" />}
            {activeTab === 'approved' && <DTRManagement lockedStatus="approved" />}
            {activeTab === 'reports' && <DTRReports />}
            {activeTab === 'notifications' && <AdminNotifications />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;