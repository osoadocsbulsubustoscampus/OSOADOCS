import { supabase } from '../supabaseClient';

/**
 * Log a system-wide audit event into public.audit_logs
 *
 * @param {Object} params
 * @param {string} params.module - 'DOCUMENTS' | 'USERS' | 'ACADEMIC' | 'REQUIREMENTS' | 'ANNOUNCEMENTS' | 'AUTH' | 'PROFILE' | 'SECURITY'
 * @param {string} params.action_type - e.g. 'DOCUMENT_APPROVED', 'USER_INVITED', 'TEMPLATE_REPLACED', 'ROLE_PERMISSIONS_UPDATED'
 * @param {string} [params.action_label] - Human friendly action label e.g. 'Approved Activity Proposal'
 * @param {string} [params.target_id] - Target entity ID
 * @param {string} [params.target_name] - Target entity name / title
 * @param {Object} [params.details] - Snapshot of changes, remarks, diff, or metadata
 * @param {Object} [params.user] - Current authenticated user object from useAuth()
 */
export const logAuditEvent = async ({
  module,
  action_type,
  action_label,
  target_id = null,
  target_name = null,
  details = {},
  user = null,
}) => {
  try {
    let resolvedUser = user;

    // If user object not passed, attempt to grab session user from supabase
    if (!resolvedUser) {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: profile } = await supabase
            .from('users')
            .select('id, full_name, role, email')
            .eq('id', authUser.id)
            .maybeSingle();

          resolvedUser = profile || authUser;
        }
      } catch (_) {}
    }

    const userName = resolvedUser?.full_name || resolvedUser?.name || resolvedUser?.email || 'System / Staff';
    const userEmail = resolvedUser?.email || '';
    const userRole = resolvedUser?.role || 'Staff';
    const userId = resolvedUser?.id || null;

    let userAgent = '';
    try {
      if (typeof window !== 'undefined' && window.navigator) {
        userAgent = window.navigator.userAgent;
      }
    } catch (_) {}

    const payload = {
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
      user_role: userRole,
      organization_name: resolvedUser?.organization_name || details?.organization_name || null,
      module: String(module || 'SYSTEM').toUpperCase(),
      action_type: String(action_type || 'UNKNOWN').toUpperCase(),
      action_label: action_label || action_type?.replace(/_/g, ' ') || 'System Action',
      target_id: target_id ? String(target_id) : null,
      target_name: target_name ? String(target_name) : null,
      details: typeof details === 'object' && details !== null ? details : { raw: details },
      user_agent: userAgent,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('audit_logs').insert([payload]);
    if (error) {
      console.warn('[Audit Log] Failed to insert audit log:', error.message);
    }
  } catch (err) {
    console.warn('[Audit Log] Unexpected error logging audit event:', err);
  }
};

/**
 * Fetch paginated and filtered audit logs
 */
export const fetchAuditLogs = async ({
  page = 1,
  pageSize = 15,
  module = 'ALL',
  actionType = '',
  search = '',
  startDate = null,
  endDate = null,
  userId = null,
}) => {
  try {
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' });

    if (module && module !== 'ALL') {
      query = query.eq('module', module.toUpperCase());
    }

    if (actionType && actionType !== 'ALL') {
      query = query.ilike('action_type', `%${actionType}%`);
    }

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString());
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }

    if (search && search.trim()) {
      const q = search.trim();
      query = query.or(
        `user_name.ilike.%${q}%,user_email.ilike.%${q}%,action_type.ilike.%${q}%,action_label.ilike.%${q}%,target_name.ilike.%${q}%,organization_name.ilike.%${q}%`
      );
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      logs: data || [],
      totalCount: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize),
      currentPage: page,
    };
  } catch (err) {
    console.error('Failed to fetch audit logs:', err);
    throw err;
  }
};

/**
 * Fetch high-level statistics for the audit trail dashboard
 */
export const fetchAuditStats = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Fetch total logs
    const { count: totalLogs, error: totalErr } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true });

    if (totalErr) throw totalErr;

    // Fetch today's logs
    const { count: todayLogs } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    // Fetch recent logs for user activity
    const { data: recentLogs } = await supabase
      .from('audit_logs')
      .select('user_id, module, action_type')
      .gte('created_at', sevenDaysAgo.toISOString())
      .limit(1000);

    const uniqueUsers = new Set((recentLogs || []).map((l) => l.user_id).filter(Boolean)).size;

    const moduleCounts = {};
    (recentLogs || []).forEach((l) => {
      moduleCounts[l.module] = (moduleCounts[l.module] || 0) + 1;
    });

    return {
      totalLogs: totalLogs || 0,
      todayLogs: todayLogs || 0,
      activeUsers7d: uniqueUsers || 0,
      moduleCounts,
    };
  } catch (err) {
    console.error('Failed to fetch audit stats:', err);
    return {
      totalLogs: 0,
      todayLogs: 0,
      activeUsers7d: 0,
      moduleCounts: {},
    };
  }
};

/**
 * Export filtered audit logs as a downloadable CSV
 */
export const exportAuditLogsToCSV = async ({
  module = 'ALL',
  search = '',
  startDate = null,
  endDate = null,
}) => {
  try {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (module && module !== 'ALL') {
      query = query.eq('module', module.toUpperCase());
    }

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString());
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }

    if (search && search.trim()) {
      const q = search.trim();
      query = query.or(
        `user_name.ilike.%${q}%,user_email.ilike.%${q}%,action_type.ilike.%${q}%,target_name.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error('No audit logs found for the selected export criteria.');
    }

    const headers = [
      'Timestamp (UTC)',
      'Local Date & Time',
      'Actor Name',
      'Actor Email',
      'Actor Role',
      'Organization',
      'Module',
      'Action Type',
      'Action Label',
      'Target Name',
      'Target ID',
      'Details / Remarks',
      'User Agent',
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = data.map((log) => {
      const d = new Date(log.created_at);
      const localTime = d.toLocaleString('en-US', { timeZoneName: 'short' });
      const detailsStr = typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '');

      return [
        escapeCsv(log.created_at),
        escapeCsv(localTime),
        escapeCsv(log.user_name),
        escapeCsv(log.user_email),
        escapeCsv(log.user_role),
        escapeCsv(log.organization_name),
        escapeCsv(log.module),
        escapeCsv(log.action_type),
        escapeCsv(log.action_label),
        escapeCsv(log.target_name),
        escapeCsv(log.target_id),
        escapeCsv(detailsStr),
        escapeCsv(log.user_agent),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `OSODOCS_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (err) {
    console.error('Failed to export audit logs:', err);
    throw err;
  }
};
