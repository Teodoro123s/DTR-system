import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './DTRReports.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const toMillis = (value) => {
  if (!value || value === '-') return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const toDateKey = (date) => date.toISOString().slice(0, 10);

const normalizeDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const direct = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return toDateKey(parsed);
};

const getMonthShape = (month) => {
  const [year, mon] = month.split('-').map(Number);
  const lastDate = new Date(year, mon, 0).getDate();
  // Use consistent month buckets by day-range: W1=1..7, W2=8..14 ... W5=29..31.
  const weekCount = Math.min(5, Math.ceil(lastDate / 7));
  return { year, mon, weekCount, lastDate };
};

const getPeriodDateKeys = (periodType, month) => {
  if (periodType === 'week') {
    const { weekCount } = getMonthShape(month);
    return Array.from({ length: weekCount }).map((_, idx) => `W${idx + 1}`);
  }

  const [year, mon] = month.split('-').map(Number);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 0);
  const days = end.getDate();
  return Array.from({ length: days }).map((_, idx) => {
    const d = new Date(start);
    d.setDate(start.getDate() + idx);
    return toDateKey(d);
  });
};

const getWeekLabelForDate = (dateStr, month) => {
  const normalized = normalizeDateKey(dateStr);
  if (!normalized) return null;
  if (!normalized.startsWith(month)) return null;
  const day = Number(normalized.slice(8, 10));
  const bucket = Math.min(5, Math.ceil(day / 7));
  return `W${bucket}`;
};

const buildLinePath = (points, width, height, maxY) => {
  if (!points.length) return '';
  const safeMax = maxY <= 0 ? 1 : maxY;
  return points
    .map((pt, idx) => {
      const x = points.length === 1 ? width / 2 : (idx / (points.length - 1)) * width;
      const y = height - (pt.value / safeMax) * height;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

function ReportLineChart({ title, points, color }) {
  const svgWidth = 640;
  const svgHeight = 210;
  const plotWidth = 580;
  const plotHeight = 150;
  const offsetX = 44;
  const offsetY = 24;

  const maxY = Math.max(...points.map((pt) => pt.value), 0);
  const linePath = buildLinePath(points, plotWidth, plotHeight, maxY);

  return (
    <div className="line-chart-card">
      <div className="line-chart-head">
        <h4>{title}</h4>
        <span>Peak: {maxY}</span>
      </div>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="line-chart-svg" role="img" aria-label={title}>
        <rect x={offsetX} y={offsetY} width={plotWidth} height={plotHeight} className="line-chart-bg" />
        {[0, 1, 2, 3, 4].map((tick) => {
          const y = offsetY + (plotHeight / 4) * tick;
          return <line key={tick} x1={offsetX} x2={offsetX + plotWidth} y1={y} y2={y} className="line-chart-grid" />;
        })}

        {points.map((pt, idx) => {
          const x = points.length === 1 ? offsetX + plotWidth / 2 : offsetX + (idx / (points.length - 1)) * plotWidth;
          const y = offsetY + (maxY ? plotHeight - (pt.value / maxY) * plotHeight : plotHeight);
          return <circle key={pt.label} cx={x} cy={y} r="3" fill={color} />;
        })}

        <path d={`M ${offsetX} ${offsetY + plotHeight} L ${offsetX + plotWidth} ${offsetY + plotHeight}`} className="line-chart-axis" />
        <path d={`M ${offsetX} ${offsetY} L ${offsetX} ${offsetY + plotHeight}`} className="line-chart-axis" />

        <path d={`M ${offsetX} ${offsetY} ${linePath}`} fill="none" stroke={color} strokeWidth="2.5" />

        {points.length > 0 && (
          <>
            <text x={offsetX} y={offsetY + plotHeight + 18} className="line-chart-label">{points[0].label}</text>
            <text x={offsetX + plotWidth / 2} y={offsetY + plotHeight + 18} textAnchor="middle" className="line-chart-label">
              {points[Math.floor((points.length - 1) / 2)].label}
            </text>
            <text x={offsetX + plotWidth} y={offsetY + plotHeight + 18} textAnchor="end" className="line-chart-label">
              {points[points.length - 1].label}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

function DTRReports() {
  const [students, setStudents] = useState([]);
  const [rows, setRows] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [periodType, setPeriodType] = useState('month');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/students`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setStudents(response.data || []);
      } catch (error) {
        setNotice('Unable to load students for reports.');
      }
    };

    loadStudents();
  }, []);

  const fetchReports = useCallback(async () => {
    if (!students.length) {
      setRows([]);
      return;
    }

    try {
      setLoading(true);
      setNotice('');
      const token = localStorage.getItem('token');

      const all = await Promise.all(
        students.map(async (student) => {
          const params = new URLSearchParams({ limit: '1000' });
          params.set('month', month);

          const response = await axios.get(`${API_URL}/dtr/${student.userId}?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          const baseRecords = response.data.records || response.data || [];
          const records = baseRecords;

          let totalMinutes = 0;
          let approvedShifts = 0;
          let pendingShifts = 0;
          let declinedShifts = 0;
          const perDay = {};

          records.forEach((record) => {
            const dateKey = normalizeDateKey(record.date);
            if (!dateKey) return;

            const inArr = record.timeIn || [];
            const outArr = record.timeOut || [];
            const statuses = record.shiftStatuses || [];
            const maxLen = Math.max(inArr.length, outArr.length);

            if (!perDay[dateKey]) {
              perDay[dateKey] = { date: dateKey, minutes: 0, approved: 0, pending: 0, declined: 0 };
            }

            for (let i = 0; i < maxLen; i += 1) {
              const timeInMs = toMillis(inArr[i]);
              const timeOutMs = toMillis(outArr[i]);
              if (timeInMs && timeOutMs && timeOutMs > timeInMs) {
                const mins = Math.round((timeOutMs - timeInMs) / 60000);
                totalMinutes += mins;
                perDay[dateKey].minutes += mins;
              }

              const status = statuses[i] || record.status || 'pending';
              if (status === 'approved') {
                approvedShifts += 1;
                perDay[dateKey].approved += 1;
              } else if (status === 'declined') {
                declinedShifts += 1;
                perDay[dateKey].declined += 1;
              } else {
                pendingShifts += 1;
                perDay[dateKey].pending += 1;
              }
            }
          });

          const totalShifts = approvedShifts + pendingShifts + declinedShifts;
          const progressPct = totalShifts ? Math.round((approvedShifts / totalShifts) * 100) : 0;

          return {
            userId: student.userId,
            studentName: `${student.firstName} ${student.lastName}`,
            username: student.username,
            recordsCount: records.length,
            approvedShifts,
            pendingShifts,
            declinedShifts,
            totalMinutes,
            progressPct,
            perDay,
          };
        })
      );

      const periodKeys = getPeriodDateKeys(periodType, month);
      const mergedByDate = {};
      all.forEach((entry) => {
        Object.values(entry.perDay || {}).forEach((dayRow) => {
          if (!mergedByDate[dayRow.date]) {
            mergedByDate[dayRow.date] = { date: dayRow.date, minutes: 0, approved: 0, pending: 0, declined: 0 };
          }
          mergedByDate[dayRow.date].minutes += dayRow.minutes;
          mergedByDate[dayRow.date].approved += dayRow.approved;
          mergedByDate[dayRow.date].pending += dayRow.pending;
          mergedByDate[dayRow.date].declined += dayRow.declined;
        });
      });

      let mergedRows = [];
      if (periodType === 'week') {
        const byWeek = {};
        periodKeys.forEach((wk) => {
          byWeek[wk] = { label: wk, minutes: 0, approved: 0, pending: 0, declined: 0 };
        });

        Object.values(mergedByDate).forEach((dayRow) => {
          const wk = getWeekLabelForDate(dayRow.date, month);
          if (!wk || !byWeek[wk]) return;
          byWeek[wk].minutes += dayRow.minutes;
          byWeek[wk].approved += dayRow.approved;
          byWeek[wk].pending += dayRow.pending;
          byWeek[wk].declined += dayRow.declined;
        });

        mergedRows = periodKeys.map((wk) => byWeek[wk]);
      } else {
        mergedRows = periodKeys.map((dateKey) => mergedByDate[dateKey] || {
          label: dateKey,
          minutes: 0,
          approved: 0,
          pending: 0,
          declined: 0,
        });
      }

      setTrendRows(mergedRows);
      setRows(all.map(({ perDay, ...rest }) => rest).sort((a, b) => b.totalMinutes - a.totalMinutes));
    } catch (error) {
      setNotice('Unable to generate reports for this period.');
    } finally {
      setLoading(false);
    }
  }, [students, periodType, month]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.students += 1;
        acc.minutes += row.totalMinutes;
        acc.records += row.recordsCount;
        acc.approved += row.approvedShifts;
        acc.pending += row.pendingShifts;
        return acc;
      },
      { students: 0, minutes: 0, records: 0, approved: 0, pending: 0 }
    );
  }, [rows]);

  const formatMinutes = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const getRowLabel = (row) => {
    const baseLabel = row?.label || row?.date || '';
    if (!baseLabel) return '--';
    if (periodType === 'week') return baseLabel;
    return baseLabel.includes('-') ? baseLabel.slice(5) : baseLabel;
  };

  const pendingSeries = trendRows.map((row) => ({
    label: getRowLabel(row),
    value: row?.pending || 0,
  }));

  const approvedSeries = trendRows.map((row) => ({
    label: getRowLabel(row),
    value: row?.approved || 0,
  }));

  return (
    <div className="reports-page">
      <div className="reports-controls">
        <div className="reports-filter-group">
          <label>Report Type</label>
          <select value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
            <option value="month">Monthly</option>
            <option value="week">Weekly</option>
          </select>
        </div>

        <div className="reports-filter-group">
          <label>{periodType === 'week' ? 'Month for Weekly Buckets' : 'Month'}</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>

        <button className="reports-refresh" onClick={fetchReports} disabled={loading}>
          {loading ? 'Generating...' : 'Refresh Report'}
        </button>
      </div>

      {notice && <p className="reports-notice">{notice}</p>}

      <div className="reports-summary-grid">
        <div className="summary-card">
          <p>Total Students</p>
          <h3>{totals.students}</h3>
        </div>
        <div className="summary-card">
          <p>Total Worked Time</p>
          <h3>{formatMinutes(totals.minutes)}</h3>
        </div>
        <div className="summary-card">
          <p>Approved Shifts</p>
          <h3>{totals.approved}</h3>
        </div>
        <div className="summary-card">
          <p>Pending Shifts</p>
          <h3>{totals.pending}</h3>
        </div>
      </div>

      <div className="reports-graph-grid">
        <ReportLineChart title={periodType === 'week' ? 'Weekly Pending Shifts Trend' : 'Daily Pending Shifts Trend'} points={pendingSeries} color="#d6861d" />
        <ReportLineChart title={periodType === 'week' ? 'Weekly Approved Shifts Trend' : 'Daily Approved Shifts Trend'} points={approvedSeries} color="#1f9a5b" />
      </div>

      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Username</th>
              <th>DTR Days</th>
              <th>Total Time</th>
              <th>Approved</th>
              <th>Pending</th>
              <th>Declined</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId}>
                <td>{row.studentName}</td>
                <td>{row.username}</td>
                <td>{row.recordsCount}</td>
                <td>{formatMinutes(row.totalMinutes)}</td>
                <td>{row.approvedShifts}</td>
                <td>{row.pendingShifts}</td>
                <td>{row.declinedShifts}</td>
                <td>
                  <div className="progress-cell">
                    <span>{row.progressPct}%</span>
                    <div className="progress-bar">
                      <div style={{ width: `${row.progressPct}%` }} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan="8" className="reports-empty">No report data available for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DTRReports;