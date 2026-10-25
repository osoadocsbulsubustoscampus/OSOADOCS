import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import * as auditService from '../services/auditService';
import PageHeader from '../components/PageHeader';
import ReportPreviewModal from '../components/ReportPreviewModal';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Download,
  Filter,
  Calendar,
  Clock,
  User,
  FileText,
  AlertCircle,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Users,
  Settings,
  Megaphone,
  KeyRound,
  FileCheck,
  Building,
  Layers,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';

const MODULE_OPTIONS = [
  { value: 'ALL', label: 'All Modules' },
  { value: 'DOCUMENTS', label: 'Documents & Workflow', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'USERS', label: 'User & Role Management', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'REQUIREMENTS', label: 'Requirements & Templates', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'ACADEMIC', label: 'Academic Calendar & Dates', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'ANNOUNCEMENTS', label: 'Announcements', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { value: 'AUTH', label: 'Authentication & Security', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'PROFILE', label: 'Profile Updates', color: 'bg-slate-50 text-slate-700 border-slate-200' },
];

const getModuleBadge = (moduleName) => {
  const m = String(moduleName || '').toUpperCase();
  const found = MODULE_OPTIONS.find((opt) => opt.value === m);
  if (found) return found;
  return { value: m, label: m, color: 'bg-gray-100 text-gray-700 border-gray-200' };
};

const getRoleBadge = (role) => {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') return { label: 'Administrator', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  if (r === 'chairman') return { label: 'OSO Chairman', bg: 'bg-blue-100 text-blue-800 border-blue-200' };
  if (r === 'vice-chairman' || r === 'vice chairman') return { label: 'OSO Vice-Chairman', bg: 'bg-purple-100 text-purple-800 border-purple-200' };
  if (r === 'org-president') return { label: 'Org President', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
  return { label: role || 'Staff', bg: 'bg-gray-100 text-gray-700 border-gray-200' };
};

const formatDate = (isoString) => {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const getRelativeTime = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  const diffSec = Math.floor((new Date() - d) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const AuditTrailPage = () => {
  const { user } = useAuth();

  // Data states
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalLogs: 0, todayLogs: 0, activeUsers7d: 0, moduleCounts: {} });
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'WEEK' | 'MONTH'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected detail modal
  const [selectedLog, setSelectedLog] = useState(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [toast, setToast] = useState(null);

  // Official Report Preview Modal State
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState({
    title: '',
    stats: [],
    headers: [],
    rows: [],
    filename: '',
    personInCharge: '',
    generatedBy: '',
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Calculate dates based on preset
  const computeDateRange = useCallback(() => {
    if (dateFilter === 'TODAY') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { start: today.toISOString(), end: null };
    }
    if (dateFilter === 'WEEK') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { start: d.toISOString(), end: null };
    }
    if (dateFilter === 'MONTH') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { start: d.toISOString(), end: null };
    }
    if (dateFilter === 'CUSTOM') {
      return {
        start: startDate ? new Date(startDate).toISOString() : null,
        end: endDate ? new Date(endDate).toISOString() : null,
      };
    }
    return { start: null, end: null };
  }, [dateFilter, startDate, endDate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = computeDateRange();
      const result = await auditService.fetchAuditLogs({
        page: currentPage,
        pageSize,
        module: selectedModule,
        search: searchTerm,
        startDate: start,
        endDate: end,
      });

      setLogs(result.logs);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      showToast('Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedModule, searchTerm, computeDateRange]);

  const loadStats = async () => {
    try {
      const s = await auditService.fetchAuditStats();
      setStats(s);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStats();
  }, []);

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const { start, end } = computeDateRange();

      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (selectedModule && selectedModule !== 'ALL') {
        query = query.eq('module', selectedModule.toUpperCase());
      }

      if (start) {
        query = query.gte('created_at', new Date(start).toISOString());
      }

      if (end) {
        const endDateObj = new Date(end);
        endDateObj.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endDateObj.toISOString());
      }

      if (searchTerm && searchTerm.trim()) {
        const q = searchTerm.trim();
        query = query.or(
          `user_name.ilike.%${q}%,user_email.ilike.%${q}%,action_type.ilike.%${q}%,target_name.ilike.%${q}%`
        );
      }

      const { data: reportLogs, error } = await query;
      if (error) throw error;

      if (!reportLogs || reportLogs.length === 0) {
        showToast('No audit logs found for the selected module and date criteria.', 'error');
        return;
      }

      const moduleObj = MODULE_OPTIONS.find((o) => o.value === selectedModule);
      const moduleLabel = moduleObj?.label || 'All Modules';

      let timeLabel = 'All Recorded History';
      if (dateFilter === 'TODAY') {
        timeLabel = `Today (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
      } else if (dateFilter === 'WEEK') {
        timeLabel = 'Last 7 Days';
      } else if (dateFilter === 'MONTH') {
        timeLabel = 'Last 30 Days';
      } else if (dateFilter === 'CUSTOM') {
        const fromStr = startDate ? new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Beginning';
        const toStr = endDate ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Present';
        timeLabel = `${fromStr} — ${toStr}`;
      }

      const reportTitle = `AUDIT TRAIL & SYSTEM COMPLIANCE REPORT — ${moduleLabel.toUpperCase()}`;

      const stats = [
        { label: 'Total Events Logged', value: reportLogs.length.toLocaleString() },
        { label: 'Selected Scope', value: moduleLabel },
        { label: 'Time Coverage', value: timeLabel },
        { label: 'Security & Integrity', value: 'RLS Verified' },
      ];

      const tableHeaders = [
        'Timestamp',
        'Actor / Performed By',
        'Role',
        'Module',
        'Action Description',
        'Target Entity',
      ];

      const tableData = reportLogs.map((log) => {
        const formattedDate = formatDate(log.created_at);
        const actorName = log.user_name || 'System';
        const actorWithOrg = log.organization_name ? `${actorName} (${log.organization_name})` : actorName;
        const roleLabel = getRoleBadge(log.user_role).label;
        const modLabel = getModuleBadge(log.module).label;
        const actionLabel = log.action_label || log.action_type || '—';
        const targetEntity = log.target_name || log.target_id || '—';

        return [
          formattedDate,
          actorWithOrg,
          roleLabel,
          modLabel,
          actionLabel,
          targetEntity,
        ];
      });

      const cleanModuleSlug = selectedModule.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];

      setReportData({
        title: reportTitle,
        stats,
        headers: tableHeaders,
        rows: tableData,
        filename: `OSODOCS_Audit_Report_${cleanModuleSlug}_${dateStr}.pdf`,
        personInCharge: user?.role === 'admin' ? 'SDS Coordinator / Institutional Administrator' : (user?.role === 'chairman' ? 'OSO Chairman' : 'Authorized Auditor'),
        generatedBy: user?.full_name || user?.name || user?.email || 'System Administrator',
      });

      setIsReportOpen(true);
    } catch (err) {
      console.error('Failed to generate report:', err);
      showToast(err.message || 'Failed to generate audit report', 'error');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleCopyJson = (obj) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch (_) {}
  };

  return (
    <div className="w-full min-h-screen animate-in fade-in duration-500 pb-20">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-10 right-10 z-[2000] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right-full duration-300 text-white font-bold text-xs ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-primary-green'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <PageHeader
          title="Audit Trail"
          subtitle="System Governance & Security Activity Logs"
          icon={ShieldCheck}
          iconColor="green"
        />

        {/* Top Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              loadData();
              loadStats();
            }}
            disabled={loading}
            className="px-4 py-2.5 bg-white border border-gray-200 hover:border-primary-green text-gray-700 hover:text-primary-green rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Refresh logs"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={loading || isGeneratingReport}
            className="px-4 py-2.5 bg-primary-green hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Generate official audit report with institutional header and logo"
          >
            {isGeneratingReport ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Generating Report...</span>
              </>
            ) : (
              <>
                <FileText size={14} />
                <span>Generate Report</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Card 1: Total Logs */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Recorded Events</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-primary-green flex items-center justify-center">
              <ShieldCheck size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{stats.totalLogs.toLocaleString()}</p>
          <span className="text-[11px] text-gray-400 font-medium">Immutable audit records</span>
        </div>

        {/* Card 2: Today's Actions */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Today's Activity</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{stats.todayLogs.toLocaleString()}</p>
          <span className="text-[11px] text-gray-400 font-medium">Logged since 12:00 AM today</span>
        </div>

        {/* Card 3: Active Users (7d) */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Active Actors (7d)</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">{stats.activeUsers7d.toLocaleString()}</p>
          <span className="text-[11px] text-gray-400 font-medium">Unique accounts performing actions</span>
        </div>

        {/* Card 4: Top Action Domain */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Compliance Status</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="text-base font-black text-emerald-700 truncate">Protected & Enforced</p>
          <span className="text-[11px] text-gray-400 font-medium">Append-only RLS policy active</span>
        </div>
      </div>

      {/* Main Filter & Data Section */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
        {/* Filters Toolbar */}
        <div className="p-5 sm:p-6 bg-gray-50/70 border-b border-gray-100 space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by actor name, email, action, or target entity..."
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-green focus:border-primary-green outline-none transition-all shadow-2xs"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Module Filter Dropdown */}
            <div className="w-full md:w-64">
              <select
                value={selectedModule}
                onChange={(e) => {
                  setSelectedModule(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-green outline-none shadow-2xs font-semibold text-gray-700 cursor-pointer"
              >
                {MODULE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Preset Filter */}
            <div className="w-full md:w-48">
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-green outline-none shadow-2xs font-semibold text-gray-700 cursor-pointer"
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Today Only</option>
                <option value="WEEK">Last 7 Days</option>
                <option value="MONTH">Last 30 Days</option>
                <option value="CUSTOM">Custom Range</option>
              </select>
            </div>
          </div>

          {/* Custom Date Range Pickers (shown if CUSTOM selected) */}
          {dateFilter === 'CUSTOM' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
              <span className="font-bold text-gray-500">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
              />
              <span className="font-bold text-gray-500">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
              />
            </div>
          )}
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 text-[10px] font-black uppercase tracking-wider text-gray-400">
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Actor / Performed By</th>
                <th className="px-6 py-4">Module</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Target Entity</th>
                <th className="px-6 py-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCw size={24} className="animate-spin text-primary-green" />
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Loading Audit Logs...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                        <ShieldCheck size={26} />
                      </div>
                      <p className="font-bold text-gray-700 text-sm">No Audit Logs Found</p>
                      <p className="text-gray-400 text-xs max-w-sm">
                        {searchTerm || selectedModule !== 'ALL' || dateFilter !== 'ALL'
                          ? 'No audit records match your current filter settings.'
                          : 'As actions are performed across OSODOCS, permanent audit logs will appear here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const moduleBadge = getModuleBadge(log.module);
                  const roleBadge = getRoleBadge(log.user_role);

                  return (
                    <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Timestamp */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-900">{formatDate(log.created_at)}</div>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {getRelativeTime(log.created_at)}
                        </span>
                      </td>

                      {/* Actor */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0">
                            {log.user_name ? log.user_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 truncate max-w-[160px] sm:max-w-[200px]" title={log.user_name}>
                              {log.user_name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${roleBadge.bg}`}>
                                {roleBadge.label}
                              </span>
                              {log.organization_name && (
                                <span className="text-[10px] text-gray-400 truncate max-w-[120px]" title={log.organization_name}>
                                  • {log.organization_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Module */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border ${moduleBadge.color}`}>
                          {moduleBadge.label}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-800">
                          {log.action_label || log.action_type?.replace(/_/g, ' ')}
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {log.action_type}
                        </span>
                      </td>

                      {/* Target Entity */}
                      <td className="px-6 py-4">
                        {log.target_name ? (
                          <div className="font-semibold text-gray-700 truncate max-w-[180px] sm:max-w-xs" title={log.target_name}>
                            {log.target_name}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">N/A</span>
                        )}
                        {log.target_id && (
                          <span className="text-[10px] text-gray-400 font-mono block truncate max-w-[140px]" title={log.target_id}>
                            ID: {log.target_id}
                          </span>
                        )}
                      </td>

                      {/* Details Button */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 hover:text-primary-green border border-gray-200 rounded-lg font-bold text-xs transition-all shadow-2xs inline-flex items-center gap-1.5"
                        >
                          <Eye size={13} />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {!loading && logs.length > 0 && (
          <div className="px-6 py-4 bg-gray-50/60 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 font-medium">
            <span>
              Showing <strong className="text-gray-800">{logs.length}</strong> of{' '}
              <strong className="text-gray-800">{totalCount.toLocaleString()}</strong> events
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors flex items-center gap-1 font-bold"
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <span className="px-3 py-1 font-bold text-gray-700">
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors flex items-center gap-1 font-bold"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log Inspection Slide-out / Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setSelectedLog(null)} />
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-[#073c2d] px-6 py-5 text-white flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-secondary-gold shrink-0 border border-white/20">
                  <ShieldCheck size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base truncate">
                    {selectedLog.action_label || selectedLog.action_type}
                  </h3>
                  <p className="text-xs text-emerald-100/80 truncate">
                    Event ID: <span className="font-mono">{selectedLog.id}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Event Overview Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Timestamp</span>
                  <p className="font-bold text-gray-800 mt-0.5">{formatDate(selectedLog.created_at)}</p>
                  <span className="text-[10px] text-gray-400 font-mono">{selectedLog.created_at}</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Module</span>
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase border ${getModuleBadge(selectedLog.module).color}`}>
                    {selectedLog.module}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Actor / Performed By</span>
                  <p className="font-bold text-gray-800 mt-0.5">{selectedLog.user_name}</p>
                  <p className="text-gray-400 text-[11px] truncate">{selectedLog.user_email || 'No email provided'}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold border ${getRoleBadge(selectedLog.user_role).bg}`}>
                    {selectedLog.user_role}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Target Resource</span>
                  <p className="font-bold text-gray-800 mt-0.5 truncate">{selectedLog.target_name || 'N/A'}</p>
                  {selectedLog.target_id && (
                    <p className="text-gray-400 font-mono text-[10px] truncate">ID: {selectedLog.target_id}</p>
                  )}
                </div>
              </div>

              {/* Remarks / Diff Section if available */}
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-700 text-xs uppercase tracking-wider">
                      Event Metadata & Payloads
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyJson(selectedLog.details)}
                      className="text-primary-green hover:underline flex items-center gap-1 font-semibold text-[11px]"
                    >
                      {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                  </div>

                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-2xl overflow-x-auto text-[11px] font-mono leading-relaxed border border-slate-800 max-h-60">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}

              {/* Client & Device Environment */}
              {selectedLog.user_agent && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-gray-500 text-[11px]">
                  <span className="font-bold text-gray-700 block mb-0.5">Client User Agent:</span>
                  <p className="font-mono break-all text-[10px] text-gray-600">{selectedLog.user_agent}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold text-xs transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Institutional Report Preview Modal */}
      <ReportPreviewModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        title={reportData.title}
        stats={reportData.stats}
        tableHeaders={reportData.headers}
        tableData={reportData.rows}
        pdfFilename={reportData.filename}
        personInCharge={reportData.personInCharge}
        generatedBy={reportData.generatedBy}
      />
    </div>
  );
};

export default AuditTrailPage;

