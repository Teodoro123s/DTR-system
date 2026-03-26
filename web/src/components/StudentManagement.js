import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './StudentManagement.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const PAGE_SIZE = 10;

function ActionIcon({ type }) {
  if (type === 'add') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2Z" />
      </svg>
    );
  }
  if (type === 'save') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4ZM7 5h8v4H7V5Zm12 14H5v-8h14v8Z" />
      </svg>
    );
  }
  if (type === 'cancel') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m13.41 12 4.3-4.29-1.42-1.42-4.29 4.3-4.29-4.3-1.42 1.42 4.3 4.29-4.3 4.29 1.42 1.42 4.29-4.3 4.29 4.3 1.42-1.42-4.3-4.29Z" />
      </svg>
    );
  }
  if (type === 'edit') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3 17.25 9.81-9.81 3.75 3.75L6.75 21H3v-3.75Zm17.71-10.04a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 2-1.66Z" />
      </svg>
    );
  }
  if (type === 'reset') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-4.9 6h-2.02A7 7 0 1 0 12 5Z" />
      </svg>
    );
  }
  if (type === 'report') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 12h2v3H7v-3Zm4-6h2v9h-2V9Zm4 3h2v6h-2v-6Z" />
      </svg>
    );
  }
  if (type === 'delete') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7h12v2H6V7Zm2 3h8l-.8 10H8.8L8 10Zm2-6h4l1 1h4v2H5V5h4l1-1Z" />
      </svg>
    );
  }
  return null;
}

function StudentManagement() {
  const [students, setStudents] = useState([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportStudentId, setReportStudentId] = useState('');
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportRows, setReportRows] = useState([]);
  const [reportSummary, setReportSummary] = useState({ minutes: 0, sessions: 0, approved: 0, pending: 0, declined: 0 });
  const [reportLoading, setReportLoading] = useState(false);
  const [reportNotice, setReportNotice] = useState('');
  const [studentsPage, setStudentsPage] = useState(1);
  const [reportPage, setReportPage] = useState(1);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setNotice('');
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/students`, { headers: { Authorization: `Bearer ${token}` } });
      setStudents(response.data);
      if (!reportStudentId && response.data?.length) {
        setReportStudentId(response.data[0].userId);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  }, [reportStudentId]);

  const formatMinutes = (mins) => {
    const safe = Math.max(0, mins || 0);
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    return `${h}h ${m}m`;
  };

  const toMillis = (value) => {
    if (!value || value === '-') return 0;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };

  const fetchStudentReport = useCallback(async (studentId = reportStudentId, monthValue = reportMonth) => {
    if (!studentId) {
      setReportRows([]);
      setReportSummary({ minutes: 0, sessions: 0, approved: 0, pending: 0, declined: 0 });
      return;
    }

    try {
      setReportLoading(true);
      setReportNotice('');
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ month: monthValue, limit: '1000' });
      const response = await axios.get(`${API_URL}/dtr/${studentId}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const records = response.data.records || response.data || [];
      const rows = records
        .map((record) => {
          const inArr = record.timeIn || [];
          const outArr = record.timeOut || [];
          const statuses = record.shiftStatuses || [];
          const sessions = Math.max(inArr.length, outArr.length);

          let minutes = 0;
          let approved = 0;
          let pending = 0;
          let declined = 0;

          for (let i = 0; i < sessions; i += 1) {
            const inMs = toMillis(inArr[i]);
            const outMs = toMillis(outArr[i]);
            if (inMs && outMs && outMs > inMs) {
              minutes += Math.round((outMs - inMs) / 60000);
            }

            const status = statuses[i] || record.status || 'pending';
            if (status === 'approved') approved += 1;
            else if (status === 'declined') declined += 1;
            else pending += 1;
          }

          return {
            dtrId: record.dtrId,
            date: record.date,
            sessions,
            status: record.status || 'pending',
            minutes,
            approved,
            pending,
            declined,
          };
        })
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      const summary = rows.reduce(
        (acc, row) => {
          acc.minutes += row.minutes;
          acc.sessions += row.sessions;
          acc.approved += row.approved;
          acc.pending += row.pending;
          acc.declined += row.declined;
          return acc;
        },
        { minutes: 0, sessions: 0, approved: 0, pending: 0, declined: 0 }
      );

      setReportRows(rows);
      setReportSummary(summary);
    } catch (err) {
      console.error('Error fetching student report:', err);
      setReportRows([]);
      setReportSummary({ minutes: 0, sessions: 0, approved: 0, pending: 0, declined: 0 });
      setReportNotice('Unable to load student DTR report.');
    } finally {
      setReportLoading(false);
    }
  }, [reportMonth, reportStudentId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    if (students.length) {
      fetchStudentReport(reportStudentId, reportMonth);
    }
  }, [fetchStudentReport, reportStudentId, reportMonth, students.length]);

  const createStudent = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setNoticeType('error');
      setNotice('Please fill in both first and last name.');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/students`, { firstName, lastName }, { headers: { Authorization: `Bearer ${token}` } });
      setFirstName('');
      setLastName('');
      setNoticeType('success');
      setNotice('Student added successfully.');
      fetchStudents();
    } catch (err) {
      console.error('Error creating student:', err);
      setNoticeType('error');
      setNotice('Failed to create student.');
    }
  };

  const updateStudent = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/students/${id}`,
        { firstName: editFirstName, lastName: editLastName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditing(null);
      setNoticeType('success');
      setNotice('Student details updated.');
      fetchStudents();
    } catch (err) {
      console.error('Error updating student:', err);
      setNoticeType('error');
      setNotice('Failed to update student.');
    }
  };

  const resetCredentials = async (id) => {
    if (window.confirm('Reset username and password to default format for this student?')) {
      try {
        const token = localStorage.getItem('token');
        await axios.put(`${API_URL}/students/${id}`, { resetCredentials: true }, { headers: { Authorization: `Bearer ${token}` } });
        setNoticeType('success');
        setNotice('Credentials reset successfully. Default format: user-Surname / pass-Surname.');
        fetchStudents();
      } catch (err) {
        console.error('Error resetting credentials:', err);
        setNoticeType('error');
        setNotice('Failed to reset credentials.');
      }
    }
  };

  const deleteStudent = async (id) => {
    if (window.confirm('Are you sure you want to delete this student?')) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${API_URL}/students/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        setNoticeType('success');
        setNotice('Student deleted.');
        fetchStudents();
      } catch (err) {
        console.error('Error deleting student:', err);
        setNoticeType('error');
        setNotice('Failed to delete student.');
      }
    }
  };

  const visibleStudents = students.filter((student) => {
    if (!searchTerm.trim()) return true;
    const target = `${student.firstName} ${student.lastName} ${student.username}`.toLowerCase();
    return target.includes(searchTerm.trim().toLowerCase());
  });

  const studentTotalPages = Math.max(1, Math.ceil(visibleStudents.length / PAGE_SIZE));
  const safeStudentsPage = Math.min(studentsPage, studentTotalPages);
  const studentStart = (safeStudentsPage - 1) * PAGE_SIZE;
  const paginatedStudents = visibleStudents.slice(studentStart, studentStart + PAGE_SIZE);

  const reportTotalPages = Math.max(1, Math.ceil(reportRows.length / PAGE_SIZE));
  const safeReportPage = Math.min(reportPage, reportTotalPages);
  const reportStart = (safeReportPage - 1) * PAGE_SIZE;
  const paginatedReportRows = reportRows.slice(reportStart, reportStart + PAGE_SIZE);

  useEffect(() => {
    setStudentsPage(1);
  }, [searchTerm]);

  useEffect(() => {
    setStudentsPage((prev) => Math.min(prev, studentTotalPages));
  }, [studentTotalPages]);

  useEffect(() => {
    setReportPage(1);
  }, [reportStudentId, reportMonth]);

  useEffect(() => {
    setReportPage((prev) => Math.min(prev, reportTotalPages));
  }, [reportTotalPages]);

  return (
    <div className="student-management">
      {notice && <p className={`notice-banner notice-${noticeType}`}>{notice}</p>}

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
          <button onClick={createStudent} className="btn btn-primary" disabled={loading}>
            <span className="btn-icon"><ActionIcon type="add" /></span>
            <span>Add Student</span>
          </button>
        </div>
      </div>

      <div className="students-section">
        <div className="students-header">
          <h3>Students List ({visibleStudents.length})</h3>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            placeholder="Search by name or username"
          />
        </div>
        {loading ? (
          <p className="loading">Loading students...</p>
        ) : visibleStudents.length === 0 ? (
          <p className="empty">No student matches the current search.</p>
        ) : (
          <div className="students-table-wrap">
            <div className="students-table">
              <div className="table-header">
                <div className="col-no">No.</div>
                <div className="col-name">Student</div>
                <div className="col-username">Username</div>
                <div className="col-actions">Actions</div>
              </div>
              {paginatedStudents.map((student, index) => (
                <div key={student.userId} className="table-row">
                {editing === student.userId ? (
                  <>
                    <div className="col-no">{studentStart + index + 1}</div>
                    <div className="col-name">
                      <input
                        type="text"
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        className="form-input-inline"
                      />
                      <input
                        type="text"
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        className="form-input-inline"
                      />
                    </div>
                    <div className="col-username">{student.username}</div>
                    <div className="col-actions">
                      <button onClick={() => updateStudent(student.userId)} className="btn btn-sm btn-success">
                        <span className="btn-icon"><ActionIcon type="save" /></span>
                        <span>Save</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditing(null);
                          setEditFirstName('');
                          setEditLastName('');
                        }}
                        className="btn btn-sm btn-secondary"
                      >
                        <span className="btn-icon"><ActionIcon type="cancel" /></span>
                        <span>Cancel</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-no">{studentStart + index + 1}</div>
                    <div className="col-name">{student.firstName} {student.lastName}</div>
                    <div className="col-username">{student.username}</div>
                    <div className="col-actions">
                      <button 
                        onClick={() => {
                          setEditing(student.userId);
                          setEditFirstName(student.firstName);
                          setEditLastName(student.lastName);
                        }}
                        className="btn btn-sm btn-edit"
                      >
                        <span className="btn-icon"><ActionIcon type="edit" /></span>
                        <span>Edit</span>
                      </button>
                      <button onClick={() => resetCredentials(student.userId)} className="btn btn-sm btn-warning">
                        <span className="btn-icon"><ActionIcon type="reset" /></span>
                        <span>Reset</span>
                      </button>
                      <button
                        onClick={() => setReportStudentId(student.userId)}
                        className="btn btn-sm btn-secondary"
                      >
                        <span className="btn-icon"><ActionIcon type="report" /></span>
                        <span>View Report</span>
                      </button>
                      <button onClick={() => deleteStudent(student.userId)} className="btn btn-sm btn-danger">
                        <span className="btn-icon"><ActionIcon type="delete" /></span>
                        <span>Delete</span>
                      </button>
                    </div>
                  </>
                )}
                </div>
              ))}
            </div>
          </div>
        )}

        {visibleStudents.length > PAGE_SIZE && (
          <div className="pagination-row">
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setStudentsPage((prev) => Math.max(1, prev - 1))}
              disabled={safeStudentsPage === 1}
            >
              Previous
            </button>
            <span className="pagination-text">Page {safeStudentsPage} of {studentTotalPages}</span>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setStudentsPage((prev) => Math.min(studentTotalPages, prev + 1))}
              disabled={safeStudentsPage === studentTotalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="student-report-section">
        <div className="student-report-header">
          <h3>Student DTR Report</h3>
          <p>View one selected student's DTR in this module.</p>
        </div>

        <div className="student-report-controls">
          <select
            className="student-report-select"
            value={reportStudentId}
            onChange={(e) => setReportStudentId(e.target.value)}
          >
            <option value="">-- Select student --</option>
            {students.map((student) => (
              <option key={student.userId} value={student.userId}>
                {student.firstName} {student.lastName} ({student.username})
              </option>
            ))}
          </select>

          <input
            type="month"
            value={reportMonth}
            onChange={(e) => setReportMonth(e.target.value)}
            className="student-report-month"
          />

          <button
            className="btn btn-primary"
            onClick={() => fetchStudentReport(reportStudentId, reportMonth)}
            disabled={!reportStudentId || reportLoading}
          >
            {reportLoading ? 'Loading...' : 'Refresh Student Report'}
          </button>
        </div>

        {reportNotice && <p className="report-notice">{reportNotice}</p>}

        <div className="student-report-summary">
          <div className="summary-chip">Total Time: <strong>{formatMinutes(reportSummary.minutes)}</strong></div>
          <div className="summary-chip">Sessions: <strong>{reportSummary.sessions}</strong></div>
          <div className="summary-chip">Approved: <strong>{reportSummary.approved}</strong></div>
          <div className="summary-chip">Pending: <strong>{reportSummary.pending}</strong></div>
          <div className="summary-chip">Declined: <strong>{reportSummary.declined}</strong></div>
        </div>

        <div className="student-report-table-wrap">
          <table className="student-report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>DTR Sessions</th>
                <th>Total Time</th>
                <th>Status</th>
                <th>Approved</th>
                <th>Pending</th>
                <th>Declined</th>
              </tr>
            </thead>
            <tbody>
              {paginatedReportRows.map((row) => (
                <tr key={row.dtrId}>
                  <td>{row.date}</td>
                  <td>{row.sessions}</td>
                  <td>{formatMinutes(row.minutes)}</td>
                  <td>{row.status}</td>
                  <td>{row.approved}</td>
                  <td>{row.pending}</td>
                  <td>{row.declined}</td>
                </tr>
              ))}

              {!reportLoading && reportRows.length === 0 && (
                <tr>
                  <td colSpan="7" className="report-empty">No DTR records for the selected student/month.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {reportRows.length > PAGE_SIZE && (
          <div className="pagination-row">
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setReportPage((prev) => Math.max(1, prev - 1))}
              disabled={safeReportPage === 1}
            >
              Previous
            </button>
            <span className="pagination-text">Page {safeReportPage} of {reportTotalPages}</span>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setReportPage((prev) => Math.min(reportTotalPages, prev + 1))}
              disabled={safeReportPage === reportTotalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentManagement;