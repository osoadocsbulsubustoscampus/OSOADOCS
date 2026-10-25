import { logAuditEvent } from './auditService';
import { supabase } from '../supabaseClient';

/**
 * Fetch all document types from the database
 */
export const fetchDocumentTypes = async () => {
  const { data, error } = await supabase
    .from('documentType')
    .select('*')
    .order('name', { ascending: true });
  
  if (error) throw error;
  return data;
};

/**
 * Fetch the currently active school year
 */
export const fetchActiveSchoolYear = async () => {
  const { data, error } = await supabase
    .from('school_years')
    .select('id')
    .eq('is_active', true)
    .single();
  
  if (error) return null;
  return data;
};

/**
 * Create a new document type
 */
export const createDocumentType = async (payload, userId = null) => {
  const { data, error } = await supabase
    .from('documentType')
    .insert([payload])
    .select();
  
  if (error) throw error;
  
  return data[0];
};

/**
 * Update an existing document type
 */
export const updateDocumentType = async (id, payload, userId = null) => {
  const { data, error } = await supabase
    .from('documentType')
    .update(payload)
    .eq('id', id)
    .select();
  
  if (error) throw error;

  return data[0];
};

/**
 * Delete a document type
 */
export const deleteDocumentType = async (id) => {
  const { error } = await supabase
    .from('documentType')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

/**
 * Fetch all requirements with their document type (for global search)
 */
export const fetchAllRequirements = async () => {
  const { data, error } = await supabase
    .from('requirements')
    .select('*, documentType:documentTypeID(id, name)')
    .order('title', { ascending: true });

  if (error) throw error;
  return data || [];
};

/**
 * Fetch requirements filtered by document type and optional proposal type
 */
export const fetchRequirements = async (typeId, subtypeId = null) => {
  let query = supabase
    .from('requirements')
    .select('*')
    .eq('documentTypeID', typeId);

  if (subtypeId) {
    // Fetch requirements that match the subtype OR are general (NULL)
    query = query.or(`subtype_id.eq.${subtypeId},subtype_id.is.null`);
  } else {
    // If no subtype is provided, just get the general ones
    query = query.is('subtype_id', null);
  }

  const { data, error } = await query.order('created_at', { ascending: true });
  
  if (error) throw error;
  return data;
};

/**
 * Upload a template file to Supabase Storage
 */
export const uploadTemplate = async (file, documentTypeName, subtypeSlug = null) => {
  const folder = documentTypeName.toLowerCase().replace(/ /g, '-');
  const fileName = `${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase()}`;
  
  // New structure: list-of-requirements/activity-proposal/in-campus/file.pdf
  let folderPath = `list-of-requirements/${folder}`;
  if (subtypeSlug) {
    folderPath += `/${subtypeSlug.toLowerCase().replace(' ', '-')}`;
  }
  
  const filePath = `${folderPath}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('documents')
    .upload(filePath, file);

  if (error) throw error;
  return data.path; // Return only the storage path
};

/**
 * Delete a file from Supabase Storage
 */
export const deleteStorageFile = async (filePath) => {
  const { error } = await supabase.storage
    .from('documents')
    .remove([filePath]);
  
  if (error) throw error;
};

/**
 * Clean and extract a user-readable file name from storage path or URL
 */
export const getCleanTemplateName = (urlOrPath) => {
  if (!urlOrPath) return null;
  const raw = String(urlOrPath).split('/').pop() || '';
  return decodeURIComponent(raw.replace(/^[0-9]+-/, ''));
};

/**
 * Log a template creation, edit, replacement, or removal action
 */
export const logTemplateAction = async ({
  requirement_id,
  document_type_id = null,
  action_type = 'TEMPLATE_UPDATED',
  requirement_title = '',
  template_name = null,
  file_url = null,
  previous_template_name = null,
  previous_file_url = null,
  performed_by = null,
  performed_by_name = 'Administrator',
  performed_by_role = null,
  notes = null
}) => {
  try {
    const payload = {
      requirement_id,
      document_type_id,
      action_type,
      requirement_title,
      template_name: template_name || getCleanTemplateName(file_url),
      file_url,
      previous_template_name: previous_template_name || getCleanTemplateName(previous_file_url),
      previous_file_url,
      performed_by,
      performed_by_name: performed_by_name || 'Staff',
      performed_by_role,
      notes,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('requirement_template_logs')
      .insert([payload])
      .select();

    if (error) {
      console.warn('Failed to insert requirement_template_logs:', error.message);
      return null;
    }

    try {
      await logAuditEvent({
        module: 'REQUIREMENTS',
        action_type,
        action_label: action_type === 'TEMPLATE_REPLACED'
          ? `Replaced template for requirement "${requirement_title}"`
          : action_type === 'TEMPLATE_UPLOADED'
          ? `Attached new template to requirement "${requirement_title}"`
          : action_type === 'TEMPLATE_REMOVED'
          ? `Removed template from requirement "${requirement_title}"`
          : `Updated requirement details for "${requirement_title}"`,
        target_id: requirement_id ? String(requirement_id) : null,
        target_name: requirement_title || template_name,
        details: {
          template_name: template_name || getCleanTemplateName(file_url),
          previous_template_name: previous_template_name || getCleanTemplateName(previous_file_url),
          notes,
        },
        user: {
          id: performed_by,
          full_name: performed_by_name,
          role: performed_by_role,
        },
      });
    } catch (_) {}

    return data?.[0] || null;
  } catch (err) {
    console.warn('Error logging template action:', err);
    return null;
  }
};

/**
 * Fetch template edit logs for a requirement or category
 */
export const fetchTemplateLogs = async ({ requirement_id = null, document_type_id = null } = {}) => {
  try {
    let query = supabase
      .from('requirement_template_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (requirement_id) {
      query = query.eq('requirement_id', requirement_id);
    } else if (document_type_id) {
      query = query.eq('document_type_id', document_type_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to fetch template logs:', err);
    return [];
  }
};

/**
 * Quick replace a template file for an existing requirement
 */
export const replaceTemplate = async (
  requirement,
  newFile,
  documentTypeName,
  subtypeSlug = null,
  user = null,
  notes = null
) => {
  const previousFileUrl = requirement.file_url || null;
  const newFilePath = await uploadTemplate(newFile, documentTypeName, subtypeSlug);

  const payload = {
    file_url: newFilePath,
    updatedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('requirements')
    .update(payload)
    .eq('id', requirement.id)
    .select();

  if (error) throw error;

  await logTemplateAction({
    requirement_id: requirement.id,
    document_type_id: requirement.documentTypeID,
    action_type: previousFileUrl ? 'TEMPLATE_REPLACED' : 'TEMPLATE_UPLOADED',
    requirement_title: requirement.title,
    template_name: getCleanTemplateName(newFilePath),
    file_url: newFilePath,
    previous_template_name: getCleanTemplateName(previousFileUrl),
    previous_file_url: previousFileUrl,
    performed_by: user?.id || null,
    performed_by_name: user?.full_name || 'Administrator',
    performed_by_role: user?.role || 'admin',
    notes: notes || (previousFileUrl ? `Replaced template file with ${newFile.name}` : `Uploaded template file ${newFile.name}`)
  });

  return data[0];
};

/**
 * Create a new requirement record
 */
export const createRequirement = async (payload, user = null) => {
  const reqPayload = {
    ...payload,
    requirement_scope: payload.requirement_scope || 'OSAS'
  };
  const { data, error } = await supabase
    .from('requirements')
    .insert([reqPayload])
    .select();
  
  if (error) throw error;

  if (user && data?.[0] && data[0].file_url) {
    const created = data[0];
    await logTemplateAction({
      requirement_id: created.id,
      document_type_id: created.documentTypeID,
      action_type: 'TEMPLATE_UPLOADED',
      requirement_title: created.title,
      template_name: getCleanTemplateName(created.file_url),
      file_url: created.file_url,
      performed_by: user?.id || null,
      performed_by_name: user?.full_name || 'Administrator',
      performed_by_role: user?.role || 'admin',
      notes: 'Initial requirement template attached'
    });
  }

  return data[0];
};

/**
 * Update an existing requirement record and log template edits
 */
export const updateRequirement = async (id, payload, user = null, previousReq = null, notes = null) => {
  const { data, error } = await supabase
    .from('requirements')
    .update(payload)
    .eq('id', id)
    .select();
  
  if (error) throw error;

  if (user && data?.[0]) {
    const prevFile = previousReq?.file_url || null;
    const newFile = payload.file_url || null;
    let action_type = null;

    if (newFile && prevFile && newFile !== prevFile) {
      action_type = 'TEMPLATE_REPLACED';
    } else if (newFile && !prevFile) {
      action_type = 'TEMPLATE_UPLOADED';
    } else if (!newFile && prevFile) {
      action_type = 'TEMPLATE_REMOVED';
    } else if (payload.title !== previousReq?.title || payload.description !== previousReq?.description) {
      action_type = 'REQUIREMENT_UPDATED';
    }

    if (action_type) {
      await logTemplateAction({
        requirement_id: id,
        document_type_id: payload.documentTypeID || previousReq?.documentTypeID || null,
        action_type,
        requirement_title: payload.title || previousReq?.title || 'Requirement',
        template_name: getCleanTemplateName(newFile),
        file_url: newFile,
        previous_template_name: getCleanTemplateName(prevFile),
        previous_file_url: prevFile,
        performed_by: user?.id || null,
        performed_by_name: user?.full_name || 'Administrator',
        performed_by_role: user?.role || 'admin',
        notes: notes || (action_type === 'TEMPLATE_REPLACED' ? 'Template file was replaced with a new version' : null)
      });
    }
  }

  return data[0];
};

/**
 * Delete a requirement record and its associated storage file
 */
export const deleteRequirement = async (id, filePath) => {
  // 1. Delete file from storage if it exists
  if (filePath) {
    await deleteStorageFile(filePath);
  }

  // 2. Delete record from database
  const { error } = await supabase
    .from('requirements')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

/**
 * Generate a signed URL for secure access to a private storage file
 */
export const generateSignedUrl = async (filePath) => {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 3600); // URL valid for 1 hour
  
  if (error) throw error;
  return data.signedUrl;
};

