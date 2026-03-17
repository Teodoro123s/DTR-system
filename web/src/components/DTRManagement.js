import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DTRManagement.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function DTRManagement() {
  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/students`, { headers: { Authorization: `Bearer ${token}` } });
      setStudents(response.data);
    } catch (err) {
      console.error('Error fetching students:', err);
    }
  };

  const fetchDTR = async (studentId) => {
    if (!studentId) {
      setRecords([]);
      return;
    }
    try {
      setLoading(true);
      setSelectedStudent(studentId);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/dtr/${studentId}`, { headers: { Authorization: `Bearer ${token}` } });
      setRecords(response.data || []);
    } catch (err) {
      console.error('Error fetching DTR records:', err);
      alert('Failed to fetch DTR records');
    } finally {
      setLoading(false);
    }
  };

  const updateDTR = async (dtrId, status) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/dtr/${dtrId}`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      // Refresh records
      if (selectedStudent) {
        fetchDTR(selectedStudent);
      }
    } catch (err) {
      console.error('Error updating DTR:', err);
      alert('Failed to update DTR record');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return '#48bb78';
      case 'declined':
        return '#ff6b6b';
      case 'pending':
        return '#f59e0b';
      default:
        return '#95a5a6';
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      approved: '✓ Approved',
      declined: '✕ Declined',
      pending: '⏳ Pending'
    };
    return labels[status] || status;
  };

  return (
    <div className="dtr-management">
      {/* Student Selection */}
      <div className="student-select-section">
        <h3>Select Student</h3>
        <select 
          value={selectedStudent}
          onChange={(e) => fetchDTR(e.target.value)}
          className="student-select"
        >
          <option value="">-- Choose a student --</option>
          {students.map(student => (
            <option key={student.userId} value={student.userId}>
              {student.firstName} {student.lastName} ({student.username})
            </option>
          ))}
        </select>
      </div>

      {/* DTR Records */}
      {selectedStudent && (
        <div className="dtr-records-section">
          <h3>📋 DTR Records ({records.length})</h3>
          {loading ? (
            <p className="loading">Loading records...</p>
          ) : records.length === 0 ? (
            <p className="empty">No DTR records found for this student.</p>
          ) : (
            <div className="records-grid">
              {records.map(record => (
                <div key={record.dtrId} className="record-card">
                  <div className="record-header">
                    <span className="record-date">📅 {record.date}</span>
                    <span 
                      className="record-status" 
                      style={{ backgroundColor: getStatusColor(record.status) }}
                    >
                      {getStatusLabel(record.status)}
                    </span>
                  </div>
                  <div className="record-times">
                    <div className="time-in">
                      <strong>Time In:</strong>
                      {record.timeIn?.length > 0 ? (
                        <ul>
                          {record.timeIn.map((time, idx) => (
                            <li key={idx}>{new Date(time).toLocaleTimeString()}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>—</p>
                      )}
                    </div>
                    <div className="time-out">
                      <strong>Time Out:</strong>
                      {record.timeOut?.length > 0 ? (
                        <ul>
                          {record.timeOut.map((time, idx) => (
                            <li key={idx}>{new Date(time).toLocaleTimeString()}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>—</p>
                      )}
                    </div>
                  </div>
                  <div className="record-actions">
                    <button 
                      onClick={() => updateDTR(record.dtrId, 'approved')}
                      className="btn btn-sm btn-success"
                    >
                      ✓ Approve
                    </button>
                    <button 
                      onClick={() => updateDTR(record.dtrId, 'declined')}
                      className="btn btn-sm btn-danger"
                    >
                      ✕ Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DTRManagement;