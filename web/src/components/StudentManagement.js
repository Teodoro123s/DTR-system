import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './StudentManagement.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function StudentManagement() {
  const [students, setStudents] = useState([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/students`, { headers: { Authorization: `Bearer ${token}` } });
      setStudents(response.data);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  };

  const createStudent = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      alert('Please fill in both fields');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/students`, { firstName, lastName }, { headers: { Authorization: `Bearer ${token}` } });
      setFirstName('');
      setLastName('');
      fetchStudents();
    } catch (err) {
      console.error('Error creating student:', err);
      alert('Failed to create student');
    }
  };

  const updateStudent = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/students/${id}`, { firstName, lastName }, { headers: { Authorization: `Bearer ${token}` } });
      setEditing(null);
      fetchStudents();
    } catch (err) {
      console.error('Error updating student:', err);
      alert('Failed to update student');
    }
  };

  const resetPassword = async (id) => {
    if (window.confirm('Reset password for this student?')) {
      try {
        const token = localStorage.getItem('token');
        await axios.put(`${API_URL}/students/${id}`, { resetPassword: true }, { headers: { Authorization: `Bearer ${token}` } });
        alert('Password has been reset to default');
      } catch (err) {
        console.error('Error resetting password:', err);
        alert('Failed to reset password');
      }
    }
  };

  const deleteStudent = async (id) => {
    if (window.confirm('Are you sure you want to delete this student?')) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${API_URL}/students/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        fetchStudents();
      } catch (err) {
        console.error('Error deleting student:', err);
        alert('Failed to delete student');
      }
    }
  };

  return (
    <div className="student-management">
      {/* Add Student Form */}
      <div className="add-student-section">
        <h3>Add New Student</h3>
        <div className="form-group">
          <input
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="form-input"
          />
          <input
            type="text"
            placeholder="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="form-input"
          />
          <button onClick={createStudent} className="btn btn-primary">
            ➕ Add Student
          </button>
        </div>
      </div>

      {/* Students List */}
      <div className="students-section">
        <h3>📚 Students List ({students.length})</h3>
        {loading ? (
          <p className="loading">Loading students...</p>
        ) : students.length === 0 ? (
          <p className="empty">No students yet. Add one above!</p>
        ) : (
          <div className="students-table">
            <div className="table-header">
              <div className="col-name">Name</div>
              <div className="col-username">Username</div>
              <div className="col-actions">Actions</div>
            </div>
            {students.map(student => (
              <div key={student.userId} className="table-row">
                {editing === student.userId ? (
                  <>
                    <div className="col-name">
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="form-input-inline"
                      />
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="form-input-inline"
                      />
                    </div>
                    <div className="col-username">{student.username}</div>
                    <div className="col-actions">
                      <button onClick={() => updateStudent(student.userId)} className="btn btn-sm btn-success">
                        ✓ Save
                      </button>
                      <button onClick={() => setEditing(null)} className="btn btn-sm btn-secondary">
                        ✕ Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-name">{student.firstName} {student.lastName}</div>
                    <div className="col-username">{student.username}</div>
                    <div className="col-actions">
                      <button 
                        onClick={() => { setEditing(student.userId); setFirstName(student.firstName); setLastName(student.lastName); }} 
                        className="btn btn-sm btn-edit"
                      >
                        ✎ Edit
                      </button>
                      <button onClick={() => resetPassword(student.userId)} className="btn btn-sm btn-warning">
                        🔑 Reset
                      </button>
                      <button onClick={() => deleteStudent(student.userId)} className="btn btn-sm btn-danger">
                        🗑 Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentManagement;