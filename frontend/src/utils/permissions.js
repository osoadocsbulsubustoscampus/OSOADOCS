export const PERMISSION_GROUPS = [
  {
    category: 'Documents & Workflow',
    description: 'Control how submissions, activity proposals, and reports are handled.',
    permissions: [
      {
        key: 'documents.view',
        label: 'View Submissions & Documents',
        description: 'Read and monitor document submissions, versions, logs, and attachments.',
      },
      {
        key: 'documents.evaluate',
        label: 'Review & Decide Documents (Approve, Return, Disapprove)',
        description: 'Evaluate submissions with full authority to approve, return for edits, or disapprove.',
      },
      {
        key: 'documents.submit',
        label: 'Submit Proposals & Reports',
        description: 'Initiate new activity proposals and submit post-activity accomplishment reports.',
      },
    ],
  },
  {
    category: 'Academic Calendar & Events',
    description: 'Manage institutional deadlines, submission windows, and school years.',
    permissions: [
      {
        key: 'academic.view',
        label: 'View Calendar & Submission Windows',
        description: 'Inspect academic dates, semesters, deadlines, and activity schedules.',
      },
      {
        key: 'academic.manage',
        label: 'Manage Calendar & Semesters',
        description: 'Create, update, activate, and delete academic events, semesters, and school years.',
      },
    ],
  },
  {
    category: 'Announcements & Bulletin',
    description: 'Publish announcements and system-wide news broadcasts.',
    permissions: [
      {
        key: 'announcements.view',
        label: 'View Announcements',
        description: 'Read campus announcements and news items on the dashboard.',
      },
      {
        key: 'announcements.manage',
        label: 'Create & Manage Announcements',
        description: 'Post new announcements, update bulletin notices, and remove old posts.',
      },
    ],
  },
  {
    category: 'Requirements & Checklists',
    description: 'Configure standard checklists and requirements for submission compliance.',
    permissions: [
      {
        key: 'requirements.view',
        label: 'View Checklists & Requirements',
        description: 'Access the list of required institutional documents and guidelines.',
      },
      {
        key: 'requirements.manage',
        label: 'Configure Requirements & Checklists',
        description: 'Add new requirements, adjust document types, and toggle mandatory items.',
      },
    ],
  },
  {
    category: 'User & Organization Directory',
    description: 'Manage campus staff personnel and registered student organizations.',
    permissions: [
      {
        key: 'users.view',
        label: 'View Users & Organizations',
        description: 'Browse campus personnel directory and student organization profiles.',
      },
      {
        key: 'users.manage',
        label: 'Create & Manage User Accounts',
        description: 'Invite new personnel, register student orgs, update roles, and suspend accounts.',
      },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

export function getPermissionMeta(key) {
  const effectiveKey = ['documents.approve', 'documents.return', 'documents.disapprove'].includes(key)
    ? 'documents.evaluate'
    : key;
  for (const group of PERMISSION_GROUPS) {
    const found = group.permissions.find((p) => p.key === effectiveKey);
    if (found) return { ...found, category: group.category };
  }
  if (key === 'roles.manage') {
    return { key, label: 'Manage Roles & Permissions', description: 'Core Administrator Capability', category: 'Administration' };
  }
  if (key === 'admin.transfer') {
    return { key, label: 'Admin Succession & Handover', description: 'Core Administrator Capability', category: 'Administration' };
  }
  return { key, label: key, description: '', category: 'General' };
}

export function formatRoleName(slug, roles = []) {
  if (!slug) return 'Unknown Role';
  const matched = roles.find((r) => r.slug === slug);
  if (matched?.name) return matched.name;
  
  // Fallbacks for known slugs
  switch (slug) {
    case 'admin':
    case 'sds-coordinator':
      return 'SDS Coordinator (Administrator)';
    case 'chairman':
      return 'OSO Chairman';
    case 'vice-chairman':
      return 'OSO Vice-Chairman';
    case 'org-president':
      return 'Student Org President';
    default:
      return slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
  }
}
