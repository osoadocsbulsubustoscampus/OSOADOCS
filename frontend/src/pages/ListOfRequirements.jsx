import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as reqService from '../services/requirementService';
import * as subtypeService from '../services/subtypeService';
import { supabase } from '../supabaseClient';
import {
  Search,
  ChevronRight,
  FileText,
  RefreshCcw,
  Calendar,
  X,
  Loader2,
  FileCode,
  Info,
  ArrowLeft,
  FileCheck,
  Eye,
  Download,
  AlertCircle,
  CheckCircle2,
  LayoutGrid,
  Settings,
  Paperclip,
  MoreHorizontal,
  Plus,
  ListChecks,
  Clock,
  History,
  UploadCloud,
  FileUp,
  Trash2,
  Pencil,
  RefreshCw,
  User,
  ArrowRight,
  Sparkles,
  Lock,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';

const formatModifiedDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
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

const getStoragePath = (filePath) => {
  let path = String(filePath || '').trim();
  if (path.startsWith('http')) {
    const bucketMarker = '/documents/';
    const index = path.indexOf(bucketMarker);
    if (index !== -1) {
      path = path.substring(index + bucketMarker.length);
    }
  }
  const queryIndex = path.indexOf('?');
  if (queryIndex !== -1) {
    path = path.substring(0, queryIndex);
  }
  if (path.startsWith('documents/')) {
    path = path.substring('documents/'.length);
  }
  return path;
};

const ListOfRequirements = () => {
  const { user, isReadOnlyAdmin, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canManage = !isReadOnlyAdmin && (
    user?.role === 'admin' ||
    hasPermission('requirements.manage') ||
    ['chairman', 'vice-chairman'].includes(user?.role)
  );

  // State
  const [documentTypes, setDocumentTypes] = useState([]);
  const [allRequirements, setAllRequirements] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [highlightReqId, setHighlightReqId] = useState(null);
  const [docSubtypes, setDocSubtypes] = useState({}); // Mapping from docTypeId -> active subtypes
  const [subTypeObj, setSubTypeObj] = useState(null); // The selected subtype object
  const [subType, setSubType] = useState(''); // Keep subType string for compatibility
  const [previewUrl, setPreviewUrl] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [toast, setToast] = useState(null);

  // Template Edit Logs state
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [logsTarget, setLogsTarget] = useState(null); // requirement object or null for category
  const [templateLogs, setTemplateLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsSearch, setLogsSearch] = useState('');

  // Quick Replace Template state
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [replaceFile, setReplaceFile] = useState(null);
  const [replaceNotes, setReplaceNotes] = useState('');
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState('');

  // Initial fetch
  useEffect(() => {
    loadDocumentTypes();
    reqService.fetchAllRequirements().then(setAllRequirements).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchUrl = async () => {
      if (!previewFile) {
        setFilePreviewUrl('');
        return;
      }
      const finalPath = getStoragePath(previewFile.url);

      try {
        const { data } = await supabase.storage
          .from('documents')
          .createSignedUrl(finalPath, 3600);

        if (data?.signedUrl) {
          setFilePreviewUrl(data.signedUrl);
          return;
        }
      } catch (e) {
        console.error('Failed to get signed URL:', e);
      }

      // Fallback
      const { data } = supabase.storage
        .from('documents')
        .getPublicUrl(finalPath);

      setFilePreviewUrl(data?.publicUrl || '');
    };
    fetchUrl();
  }, [previewFile]);

  // Fetch requirements when type or subType changes
  useEffect(() => {
    if (selectedType) {
      const isProposal = selectedType.name.toLowerCase().includes('activity proposal');
      loadRequirements(selectedType.id, isProposal ? (subTypeObj?.id || null) : null, isProposal ? (subTypeObj?.name || subType || null) : null);
    }
  }, [selectedType, subTypeObj, subType]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadDocumentTypes = async () => {
    setLoading(true);
    try {
      const data = await reqService.fetchDocumentTypes();
      setDocumentTypes(data || []);

      const subtypesRes = await supabase
        .from('document_subtypes')
        .select('*')
        .eq('status', 'active')
        .order('sort_order', { ascending: true });
        
      if (subtypesRes.data) {
        const subtypesMap = {};
        subtypesRes.data.forEach(st => {
          if (!subtypesMap[st.document_type_id]) subtypesMap[st.document_type_id] = [];
          subtypesMap[st.document_type_id].push(st);
        });
        setDocSubtypes(subtypesMap);
      }
    } catch (error) {
      showToast('Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadRequirements = async (typeId, subtypeId = null, proposalType = null) => {
    setLoading(true);
    try {
      const data = await reqService.fetchRequirements(typeId, subtypeId, proposalType);
      setRequirements(data || []);
    } catch (error) {
      showToast('Failed to load requirements', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Icon mapper based on keywords
  const getIconForType = (name) => {
    const n = name.toLowerCase();
    if (n.includes('renewal')) return <RefreshCcw className="text-green-500" />;
    if (n.includes('activity') || n.includes('proposal')) return <FileText className="text-blue-500" />;
    if (n.includes('report') || n.includes('year')) return <Calendar className="text-orange-500" />;
    if (n.includes('finance') || n.includes('budget')) return <FileCode className="text-purple-500" />;
    return <FileCheck className="text-gray-500" />;
  };

  const getBgForType = (name) => {
    const n = name.toLowerCase();
    if (n.includes('renewal')) return 'bg-green-50';
    if (n.includes('activity') || n.includes('proposal')) return 'bg-blue-50';
    if (n.includes('report') || n.includes('year')) return 'bg-orange-50';
    if (n.includes('finance') || n.includes('budget')) return 'bg-purple-50';
    return 'bg-gray-50';
  };

  const globalSearchResults = searchQuery.trim().length >= 2
    ? allRequirements.filter((req) => {
        const q = searchQuery.toLowerCase();
        return (
          (req.title || '').toLowerCase().includes(q) ||
          (req.referenceCode || '').toLowerCase().includes(q) ||
          (req.description || '').toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  const filteredRequirements = requirements.filter((req) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (req.title || '').toLowerCase().includes(q) ||
      (req.referenceCode || '').toLowerCase().includes(q) ||
      (req.description || '').toLowerCase().includes(q)
    );
  });

  const handleSearchResultClick = (req) => {
    const type = documentTypes.find((t) => t.id === req.documentTypeID) ||
      documentTypes.find((t) => t.id === req.documentType?.id);
    if (!type) return;
    setSelectedType(type);
    setSearchQuery('');
    setShowSearchResults(false);
    setHighlightReqId(req.id);
    if (req.subtype_id || req.proposal_type) {
      const subtypes = docSubtypes[type.id] || [];
      const match = subtypes.find(st => st.id === req.subtype_id || st.name === req.proposal_type);
      if (match) {
        setSubTypeObj(match);
        setSubType(match.name);
      }
    } else {
      setSubTypeObj(null);
      setSubType('');
    }
    setTimeout(() => {
      const el = document.getElementById(`requirement-row-${req.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightReqId(null), 3000);
    }, 400);
  };

  // Preview & Download
  const handlePreview = async (filePath) => {
    setIsPreviewLoading(true);
    setIsPreviewOpen(true);
    try {
      const finalPath = getStoragePath(filePath);
      const url = await reqService.generateSignedUrl(finalPath);
      setPreviewUrl(url);
    } catch (error) {
      showToast('Preview failed', 'error');
      setIsPreviewOpen(false);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleDownload = async (filePath, fileName) => {
    try {
      const finalPath = getStoragePath(filePath);
      const url = await reqService.generateSignedUrl(finalPath);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      showToast('Download failed', 'error');
    }
  };

  const handleOpenLogs = async (req = null) => {
    setLogsTarget(req);
    setIsLogsModalOpen(true);
    setLogsLoading(true);
    setLogsSearch('');
    try {
      const logs = await reqService.fetchTemplateLogs({
        requirement_id: req ? req.id : null,
        document_type_id: selectedType ? selectedType.id : null,
      });
      setTemplateLogs(logs || []);
    } catch (err) {
      console.error('Failed to load template logs:', err);
      showToast('Failed to load template logs', 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleOpenReplace = (req) => {
    setReplaceTarget(req);
    setReplaceFile(null);
    setReplaceNotes('');
    setReplaceError('');
    setIsReplaceModalOpen(true);
  };

  const handleConfirmReplace = async (e) => {
    e.preventDefault();
    if (!replaceFile) {
      setReplaceError('Please select a valid template file (.pdf, .docx, .doc).');
      return;
    }
    if (!replaceTarget || !selectedType) return;

    setIsReplacing(true);
    setReplaceError('');

    try {
      const isProposal = selectedType.name.toLowerCase().includes('activity proposal');
      const subtypeSlug = isProposal ? (subTypeObj?.name || subType || null) : null;

      await reqService.replaceTemplate(
        replaceTarget,
        replaceFile,
        selectedType.name,
        subtypeSlug,
        user,
        replaceNotes.trim() || `Template replaced via List of Requirements by ${user?.full_name || 'Staff'}`
      );

      showToast('Template successfully replaced and logged!');
      setIsReplaceModalOpen(false);
      setReplaceTarget(null);
      setReplaceFile(null);
      setReplaceNotes('');

      // Refresh requirements list
      await loadRequirements(
        selectedType.id,
        isProposal ? (subTypeObj?.id || null) : null,
        isProposal ? (subTypeObj?.name || subType || null) : null
      );
    } catch (err) {
      console.error('Failed to replace template:', err);
      setReplaceError(err.message || 'Failed to replace template');
      showToast(err.message || 'Failed to replace template', 'error');
    } finally {
      setIsReplacing(false);
    }
  };

  const formatLogDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
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

  const getRoleBadge = (role) => {
    const r = String(role || '').toLowerCase();
    if (r === 'admin') return { label: 'Administrator', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    if (r === 'chairman') return { label: 'OSO Chairman', bg: 'bg-blue-100 text-blue-800 border-blue-200' };
    if (r === 'vice-chairman') return { label: 'OSO Vice-Chairman', bg: 'bg-purple-100 text-purple-800 border-purple-200' };
    if (r === 'org-president') return { label: 'Org President', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
    return { label: role || 'Staff', bg: 'bg-gray-100 text-gray-700 border-gray-200' };
  };

  const filteredLogs = templateLogs.filter((log) => {
    if (!logsSearch.trim()) return true;
    const q = logsSearch.toLowerCase();
    return (
      (log.requirement_title || '').toLowerCase().includes(q) ||
      (log.template_name || '').toLowerCase().includes(q) ||
      (log.previous_template_name || '').toLowerCase().includes(q) ||
      (log.performed_by_name || '').toLowerCase().includes(q) ||
      (log.action_type || '').toLowerCase().includes(q) ||
      (log.notes || '').toLowerCase().includes(q)
    );
  });

  if (loading && documentTypes.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50/20">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full border-4 border-primary-green/10 border-t-primary-green animate-spin" />
            <div className="absolute inset-4 rounded-full border-4 border-secondary-gold/10 border-b-secondary-gold animate-spin-reverse" />
          </div>
          <span className="text-gray-400 font-black uppercase tracking-[0.2em] text-[10px]">Synchronizing Cloud Data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen animate-in fade-in duration-500">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-10 right-10 z-[2000] flex items-center gap-4 px-8 py-5 rounded-[2rem] shadow-2xl animate-in slide-in-from-right-full duration-500 ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-primary-green text-white'
          }`}>
          {toast.type === 'error' ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
          <span className="font-black text-sm uppercase tracking-wider">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-16 flex flex-col xl:flex-row xl:items-center justify-between gap-10">
        <PageHeader 
          title="Requirements" 
          subtitle={selectedType ? `Document Management / ${selectedType.name}` : 'Document Management / All Categories'} 
          icon={ListChecks} 
          iconColor="green" 
        />

        <div className="flex flex-col md:flex-row items-center gap-6 w-full xl:max-w-xl">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-green transition-all" size={20} />
            <input
              type="text"
              placeholder="Search by code or title across all categories..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:border-primary-green focus:ring-0 outline-none transition-all shadow-sm font-bold text-gray-700 text-sm"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
            />
            {showSearchResults && globalSearchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden">
                {globalSearchResults.map((req) => (
                  <button
                    key={req.id}
                    type="button"
                    onMouseDown={() => handleSearchResultClick(req)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <p className="font-bold text-sm text-gray-800">{req.title}</p>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                      {req.referenceCode || 'GENERAL'} • {req.documentType?.name || 'Category'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {!selectedType ? (
        /* Dynamic Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 animate-in slide-in-from-bottom-10 duration-700">
          {documentTypes.map((type) => {
            const hasSubtypes = docSubtypes[type.id] && docSubtypes[type.id].length > 0;
            return (
            <div
              key={type.id}
              onClick={() => {
                setSelectedType(type);
                if (hasSubtypes) {
                   setSubTypeObj(docSubtypes[type.id][0]);
                   setSubType(docSubtypes[type.id][0].name);
                } else {
                   setSubTypeObj(null);
                   setSubType('');
                }
              }}
              className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative overflow-hidden"
            >
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/requirements/settings/${type.id}`);
                  }}
                  className="absolute top-4 right-4 p-2.5 text-gray-400 hover:text-primary-green hover:bg-green-50 rounded-xl transition-all z-10"
                  title="Category settings"
                >
                  <Settings size={20} />
                </button>
              )}
              <div className={`${getBgForType(type.name)} w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-300`}>
                {React.cloneElement(getIconForType(type.name), { size: 32 })}
              </div>
              <h3 className="text-xl font-black text-gray-800 mb-3 group-hover:text-primary-green transition-colors leading-tight">{type.name}</h3>
              <p className="text-gray-500 font-medium leading-relaxed mb-8 text-sm line-clamp-2">{type.description || 'View and download requirements for this document category.'}</p>

              <div className="pt-6 border-t border-gray-50 flex items-center justify-between mt-auto">

                <div className="flex items-center gap-3 ml-auto">
                  <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Explore List</span>
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-primary-green group-hover:text-white transition-all duration-300">
                    <ChevronRight size={16} />
                  </div>
                </div>
              </div>
            </div>
            );
          })}
          {documentTypes.length === 0 && (
            <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-gray-100 flex flex-col items-center gap-4">
              <Info size={48} className="text-gray-300" />
              <div className="space-y-1">
                <p className="text-xl font-black text-gray-400 uppercase tracking-widest">No Categories Defined</p>
                <p className="text-gray-500 text-sm">Admins can create new document types to start grouping requirements.</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Requirements Table */
        <div className="animate-in slide-in-from-right-10 duration-500">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setSelectedType(null)}
              className="flex items-center gap-3 text-gray-500 hover:text-primary-green hover:bg-gray-50 transition-all p-3 rounded-xl"
            >
              <ArrowLeft size={24} />
              <span className="font-bold text-sm">Back</span>
            </button>

            {canManage && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenLogs(null)}
                  className="flex items-center gap-2 px-5 py-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-100 transition-all shadow-xs"
                  title="View all template revision and edit logs for this category"
                >
                  <History size={17} className="text-primary-green" />
                  Revision History
                </button>
                <button
                  onClick={() => navigate(`/admin/academic-dates/submission-windows`)}
                  className="flex items-center gap-2 px-5 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-100 transition-all"
                >
                  <Calendar size={18} />
                  Submission Window
                </button>
                <button
                  onClick={() => navigate(`/requirements/settings/${selectedType.id}`)}
                  className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-700 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  <Settings size={18} />
                  Category Settings
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-gray-100 bg-gray-50/30 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className={`${getBgForType(selectedType.name)} w-14 h-14 rounded-xl shadow-sm flex items-center justify-center`}>
                  {React.cloneElement(getIconForType(selectedType.name), { size: 24 })}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-800 tracking-tight leading-none mb-1.5">{selectedType.name}</h2>
                  <p className="text-gray-500 text-sm">{selectedType.description || 'System-authorized requirements and templates.'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 w-full sm:w-auto">
                {/* NEW: Dynamic Subcategory Toggle */}
                {selectedType && docSubtypes[selectedType.id] && docSubtypes[selectedType.id].length > 0 && (
                  <>
                    <div className="hidden sm:flex bg-white p-1.5 rounded-xl shadow-sm border border-gray-100">
                      {docSubtypes[selectedType.id].map((st) => (
                        <button
                          key={st.id}
                          onClick={() => {
                            setSubTypeObj(st);
                            setSubType(st.name);
                          }}
                          className={`px-6 py-2.5 rounded-lg text-xs font-black transition-all duration-300 uppercase tracking-widest ${subTypeObj?.id === st.id
                            ? 'bg-primary-green text-white shadow-md'
                            : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                          {st.name}
                        </button>
                      ))}
                    </div>
                    <div className="block sm:hidden w-full">
                      <select
                        value={subTypeObj?.id || ''}
                        onChange={(e) => {
                          const found = docSubtypes[selectedType.id].find(s => s.id === e.target.value);
                          if (found) {
                            setSubTypeObj(found);
                            setSubType(found.name);
                          }
                        }}
                        className="w-full bg-white border border-gray-200 text-primary-green font-bold text-xs rounded-xl p-3 shadow-sm outline-none focus:ring-2 focus:ring-primary-green/20 cursor-pointer"
                      >
                        {docSubtypes[selectedType.id].map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="pb-48">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#073c2d] text-white border-b-2 border-[#073c2d]">
                    <th className="px-3 sm:px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-white">Title of Requirement</th>
                    <th className="hidden sm:table-cell px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-white">Code</th>
                    <th className="hidden lg:table-cell px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-white">Description</th>
                    <th className="hidden md:table-cell px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-white">Attachment</th>
                    <th className="hidden xl:table-cell px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-white">Last Modified</th>
                    <th className="px-3 sm:px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-right text-white">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-gray-50">
                  {filteredRequirements.length > 0 ? (
                    filteredRequirements.map((req) => (
                      <tr
                        key={req.id}
                        id={`requirement-row-${req.id}`}
                        className={`hover:bg-gray-50/20 transition-all group ${highlightReqId === req.id ? 'bg-primary-green/10 ring-2 ring-primary-green/30 ring-inset' : ''}`}
                      >
                        <td className="px-3 sm:px-6 py-4">
                          <div className="flex flex-col items-start gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded-full ${
                                (req.requirement_scope || 'OSAS') === 'OSAS'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100/90 text-slate-500 border border-slate-200'
                              }`}>
                                {(req.requirement_scope || 'OSAS') === 'OSAS' ? 'OSAS Requirement' : 'LOCAL Requirement'}
                              </span>
                              {(req.is_optional === true || String(req.is_optional) === 'true') && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[9px] sm:text-[10px] font-black uppercase rounded shadow-sm">
                                  Optional
                                </span>
                              )}
                            </div>
                            <span className="font-semibold text-sm sm:text-base text-gray-800 leading-tight">{req.title}</span>
                            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1 xl:hidden mt-0.5">
                              <Clock size={11} className="shrink-0" />
                              Modified: {formatModifiedDate(req.updated_at || req.updatedAt || req.created_at)}
                            </span>
                          </div>
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4">
                          <span className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-black tracking-widest border border-gray-200/50">
                            {req.referenceCode || 'GENERAL'}
                          </span>
                        </td>
                        <td className="hidden lg:table-cell px-6 py-4">
                          <p className="text-gray-400 font-bold text-xs leading-relaxed line-clamp-2">{req.description || 'No special instructions provided.'}</p>
                        </td>
                        <td className="hidden md:table-cell px-6 py-4">
                          {req.file_url ? (
                            <div className="flex items-center gap-2 text-primary-green">
                              <FileText size={16} />
                              <span className="font-black text-xs truncate max-w-[160px]" title={req.file_url.split('/').pop()}>
                                {req.file_url.split('/').pop().replace(/^[0-9]+-/, '')}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-black text-xs text-gray-400 uppercase">None</span>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReplace(req)}
                                  className="text-[10px] text-primary-green hover:underline font-bold flex items-center gap-1"
                                >
                                  <UploadCloud size={11} /> Add Template
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="hidden xl:table-cell px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-gray-500 font-medium text-xs">
                              <Clock size={14} className="text-gray-400 shrink-0" />
                              <span>{formatModifiedDate(req.updated_at || req.updatedAt || req.created_at)}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenLogs(req)}
                              className="text-[10px] text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 hover:underline w-fit"
                              title="View template revision history & audit logs"
                            >
                              <History size={11} /> Revision History
                            </button>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 relative">
                          <div className="flex justify-end items-center gap-1.5 relative">
                            {/* Direct Preview Button */}
                            {req.file_url && (
                              <button
                                type="button"
                                onClick={() => setPreviewFile({ title: req.title, url: req.file_url })}
                                className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all"
                                title="Preview Template"
                              >
                                <Eye size={18} />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setActiveDropdown(activeDropdown === req.id ? null : req.id)}
                              className="p-2 text-gray-400 hover:text-primary-green hover:bg-gray-100 rounded-lg transition-all"
                            >
                              <MoreHorizontal size={18} />
                            </button>

                            {activeDropdown === req.id && (
                              <div className="absolute right-0 top-10 mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                {req.file_url && (
                                  <>
                                    <button onClick={() => { setPreviewFile({ title: req.title, url: req.file_url }); setActiveDropdown(null); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 hover:text-primary-green flex items-center gap-2.5">
                                      <Eye size={15} /> Preview Template
                                    </button>
                                    <button onClick={() => { handleDownload(req.file_url, `${req.title}${req.file_url.toLowerCase().endsWith('.docx') ? '.docx' : '.pdf'}`); setActiveDropdown(null); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 hover:text-primary-green flex items-center gap-2.5">
                                      <Download size={15} /> Download Template
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => { handleOpenLogs(req); setActiveDropdown(null); }}
                                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 hover:text-primary-green flex items-center gap-2.5 border-t border-gray-100"
                                >
                                  <History size={15} className="text-primary-green" /> Template Edit Logs
                                </button>
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => { handleOpenReplace(req); setActiveDropdown(null); }}
                                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2.5"
                                  >
                                    <UploadCloud size={15} /> Replace Template
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center opacity-40">
                        <div className="flex flex-col items-center gap-4">
                          <Info size={64} className="text-gray-200" />
                          <div className="space-y-1">
                            <p className="text-xl font-black text-gray-400 uppercase tracking-widest">Category Empty</p>
                            <p className="text-gray-400 font-bold text-sm">No requirements have been listed yet.</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-[1200] flex flex-col bg-gray-950/98 animate-in fade-in duration-500">
          <div className="flex items-center justify-between p-10 bg-black/20 backdrop-blur-xl">
            <h3 className="text-white font-black tracking-tighter text-3xl">Document Template</h3>
            <button onClick={() => { setIsPreviewOpen(false); setPreviewUrl(''); }} className="text-white p-4 hover:rotate-90 transition-all duration-300"><X size={48} /></button>
          </div>
          <div className="flex-1 p-10">
            <div className="bg-white mx-auto w-full max-w-7xl h-full rounded-[4rem] shadow-2xl overflow-hidden">
              {isPreviewLoading ? (
                <div className="w-full h-[60vh] flex flex-col items-center justify-center gap-4">
                  <div className="w-10 h-10 border-4 border-primary-green border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-primary-green font-bold tracking-[0.2em] text-xs uppercase animate-pulse">Loading Document Preview...</span>
                </div>
              ) : previewUrl?.toLowerCase().includes('.docx') ? (
                <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`} className="w-full h-full border-none" title="Word Preview" />
              ) : (
                <iframe src={`${previewUrl}#toolbar=0`} className="w-full h-full border-none" title="PDF" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal Overlay */}
      {previewFile && (
        <div 
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[1200] flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-300"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl sm:rounded-3xl w-[95vw] sm:max-w-5xl h-[88vh] sm:h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-300 my-auto"
          >
            {/* Header */}
            <div className="bg-gray-50 border-b border-gray-100 px-4 sm:px-8 py-3.5 sm:py-5 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                  <Paperclip size={18} className="sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-800 text-sm sm:text-lg truncate max-w-[200px] sm:max-w-md" title={previewFile.title}>
                      {previewFile.title}
                    </h3>
                    {previewFile.isArchived && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                        Archived Version • Audit Only
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-[10px] sm:text-xs font-medium max-w-[180px] sm:max-w-sm truncate" title={previewFile.url?.split('/').pop()}>
                    File: {previewFile.url?.split('/').pop()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="p-2 sm:p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-all shrink-0 cursor-pointer shadow-xs"
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-100 p-2.5 sm:p-6">
              <div className="flex-1 bg-white rounded-xl sm:rounded-2xl overflow-hidden shadow-sm border border-gray-200/50 relative">
                {previewFile.url?.toLowerCase().includes('.pdf') ? (
                  <iframe
                    src={filePreviewUrl ? `${filePreviewUrl}#toolbar=1&navpanes=0&view=Fit` : null}
                    className="w-full h-full border-0 rounded-xl sm:rounded-2xl"
                    title="PDF Preview"
                  />
                ) : previewFile.url?.toLowerCase().includes('.docx') ? (
                  <iframe
                    src={filePreviewUrl ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(filePreviewUrl)}` : null}
                    className="w-full h-full border-0 rounded-xl sm:rounded-2xl"
                    title="Word Preview"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 text-center">
                    <FileText size={40} className="text-gray-300 mb-3 animate-bounce sm:w-12 sm:h-12" />
                    <h4 className="font-bold text-gray-700 text-xs sm:text-sm mb-1">Preview is not supported for this file type</h4>
                    <p className="text-gray-400 text-[11px] sm:text-xs max-w-xs mb-4">You can download it to view locally on your device.</p>
                    {previewFile.isArchived ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold max-w-xs">
                        Archived versions cannot be downloaded to prevent using outdated forms.
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDownload(previewFile.url, `${previewFile.title}${previewFile.url?.toLowerCase().endsWith('.docx') ? '.docx' : '.pdf'}`)}
                        className="bg-indigo-600 text-white px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md inline-flex items-center gap-2"
                      >
                        <Download size={16} /> Download Template
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Edit Logs Modal */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsLogsModalOpen(false)} />
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl relative z-10 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary-green flex items-center justify-center shrink-0 border border-emerald-100">
                  <History size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 truncate">
                    Template Revision History
                  </h3>
                  <p className="text-xs text-gray-500 truncate">
                    {logsTarget ? `${logsTarget.title} (${logsTarget.referenceCode || 'General'})` : `${selectedType?.name || 'Category'} Requirements`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLogsModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Toolbar */}
            <div className="px-5 py-3 bg-white border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter logs by template, editor, or action..."
                  className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-primary-green outline-none transition-all"
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                />
              </div>
              <span className="text-xs text-gray-500 shrink-0">
                {filteredLogs.length} {filteredLogs.length === 1 ? 'record' : 'records'}
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-gray-50/40">
              {logsLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2">
                  <Loader2 size={24} className="animate-spin text-primary-green" />
                  <span className="text-xs text-gray-500 font-medium">Loading history...</span>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="py-14 text-center flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                    <History size={20} />
                  </div>
                  <p className="text-xs font-bold text-gray-600">No Revision History Found</p>
                  <p className="text-xs text-gray-400 max-w-xs">
                    {logsSearch ? 'No logs match your filter.' : 'Changes and template updates will appear here.'}
                  </p>
                </div>
              ) : (
                filteredLogs.map((log, index) => {
                  const roleBadge = getRoleBadge(log.performed_by_role);
                  const isReplaced = log.action_type === 'TEMPLATE_REPLACED';
                  const isUploaded = log.action_type === 'TEMPLATE_UPLOADED';
                  const isRemoved = log.action_type === 'TEMPLATE_REMOVED';
                  const isCurrent = index === 0;

                  return (
                    <div
                      key={log.id}
                      className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-2.5 shadow-2xs hover:border-gray-300 transition-colors"
                    >
                      {/* Top Bar: Action, Active Badge, Date */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isReplaced
                                ? 'bg-amber-100 text-amber-800'
                                : isUploaded
                                ? 'bg-emerald-100 text-emerald-800'
                                : isRemoved
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {log.action_type.replace(/_/g, ' ')}
                          </span>

                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active Version
                            </span>
                          )}

                          {!logsTarget && (
                            <span className="text-xs font-semibold text-gray-700 truncate max-w-[200px]">
                              {log.requirement_title}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-gray-400 font-medium shrink-0 flex items-center gap-1">
                          <Clock size={11} />
                          {formatLogDate(log.created_at)}
                        </span>
                      </div>

                      {/* File Details */}
                      {isReplaced ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-gray-50 rounded-lg text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {log.previous_template_name && (
                              <>
                                <span className="text-gray-400 line-through truncate max-w-[150px] sm:max-w-[180px]" title={log.previous_template_name}>
                                  {log.previous_template_name}
                                </span>
                                <ArrowRight size={12} className="text-gray-400 shrink-0" />
                              </>
                            )}
                            <div className="flex items-center gap-1 min-w-0 font-bold text-gray-800">
                              <FileText size={14} className="text-primary-green shrink-0" />
                              <span className="truncate max-w-[160px] sm:max-w-[200px]" title={log.template_name || log.file_url}>
                                {log.template_name || log.file_url?.split('/').pop()}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            {log.previous_file_url && (
                              <button
                                type="button"
                                onClick={() => setPreviewFile({ title: `[Previous] ${log.previous_template_name}`, url: log.previous_file_url, isArchived: true })}
                                className="px-2.5 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 rounded-md font-medium transition-colors"
                              >
                                View Previous
                              </button>
                            )}
                            {log.file_url && (
                              <button
                                type="button"
                                onClick={() => setPreviewFile({ title: log.template_name || log.requirement_title || 'Template Preview', url: log.file_url, isArchived: !isCurrent })}
                                className="px-2.5 py-1 text-xs bg-white border border-gray-200 text-gray-700 hover:text-primary-green hover:border-primary-green rounded-md font-medium transition-all"
                              >
                                Preview
                              </button>
                            )}
                            {isCurrent && log.file_url && (
                              <button
                                type="button"
                                onClick={() => handleDownload(log.file_url, log.template_name || 'template')}
                                className="px-2.5 py-1 text-xs bg-primary-green text-white hover:bg-emerald-800 rounded-md font-medium transition-all"
                              >
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      ) : isUploaded || log.file_url ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-gray-50 rounded-lg text-xs">
                          <div className="flex items-center gap-1.5 min-w-0 font-bold text-gray-800">
                            <FileText size={14} className="text-primary-green shrink-0" />
                            <span className="truncate max-w-[240px] sm:max-w-sm" title={log.template_name || log.file_url}>
                              {log.template_name || log.file_url?.split('/').pop()}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => setPreviewFile({ title: log.template_name || log.requirement_title || 'Template Preview', url: log.file_url, isArchived: !isCurrent })}
                              className="px-2.5 py-1 text-xs bg-white border border-gray-200 text-gray-700 hover:text-primary-green hover:border-primary-green rounded-md font-medium transition-all"
                            >
                              Preview
                            </button>
                            {isCurrent && (
                              <button
                                type="button"
                                onClick={() => handleDownload(log.file_url, log.template_name || 'template')}
                                className="px-2.5 py-1 text-xs bg-primary-green text-white hover:bg-emerald-800 rounded-md font-medium transition-all"
                              >
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      ) : isRemoved ? (
                        <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                          <Trash2 size={13} className="shrink-0 text-rose-500" />
                          <span>Template was removed {log.previous_template_name ? `(${log.previous_template_name})` : ''}</span>
                        </div>
                      ) : null}

                      {/* Footer: Performer & Notes */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 pt-0.5 border-t border-gray-100">
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-gray-400" />
                          <span>By <strong className="text-gray-700 font-semibold">{log.performed_by_name}</strong></span>
                          <span className="text-gray-300">•</span>
                          <span className="text-gray-500 font-medium">{roleBadge.label}</span>
                        </div>
                        {log.notes && (
                          <span className="text-gray-500 italic truncate max-w-xs" title={log.notes}>
                            Note: "{log.notes}"
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Replace Template Modal */}
      {isReplaceModalOpen && replaceTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => !isReplacing && setIsReplaceModalOpen(false)} />
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-[#073c2d] p-6 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                  <UploadCloud size={20} className="text-secondary-gold" />
                  Replace Requirement Template
                </h3>
                <p className="text-xs text-emerald-100/80 truncate mt-0.5">
                  {replaceTarget.title} ({replaceTarget.referenceCode || 'GENERAL'})
                </p>
              </div>
              <button
                type="button"
                disabled={isReplacing}
                onClick={() => setIsReplaceModalOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleConfirmReplace} className="p-6 space-y-4">
              {replaceError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-red-500" />
                  <span>{replaceError}</span>
                </div>
              )}

              {/* Current Template Card */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Current Template</span>
                  <p className="text-xs font-bold text-gray-800 truncate" title={replaceTarget.file_url}>
                    {replaceTarget.file_url ? replaceTarget.file_url.split('/').pop().replace(/^[0-9]+-/, '') : 'No template currently attached'}
                  </p>
                </div>
                {replaceTarget.file_url && (
                  <button
                    type="button"
                    onClick={() => setPreviewFile({ title: replaceTarget.title, url: replaceTarget.file_url })}
                    className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg shrink-0 flex items-center gap-1"
                  >
                    <Eye size={13} /> View Current
                  </button>
                )}
              </div>

              {/* File Upload Dropzone */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Select New Template File *
                </label>
                <div className="relative border-2 border-dashed border-gray-300 hover:border-primary-green rounded-2xl p-6 text-center bg-gray-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer group">
                  <input
                    type="file"
                    required
                    accept=".pdf,.docx,.doc"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setReplaceFile(file);
                        setReplaceError('');
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-2 pointer-events-none">
                    <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-primary-green group-hover:scale-110 transition-transform">
                      <UploadCloud size={24} />
                    </div>
                    {replaceFile ? (
                      <div>
                        <p className="text-xs font-bold text-emerald-800 truncate max-w-xs">{replaceFile.name}</p>
                        <span className="text-[10px] text-gray-400 font-medium">({(replaceFile.size / 1024).toFixed(1)} KB) • Click or drop to change</span>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-bold text-gray-700">Click to upload or drag & drop</p>
                        <span className="text-[10px] text-gray-400 font-medium">Supports PDF, DOCX, DOC (up to 25MB)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modification Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Reason / Revision Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Updated signatories and guidelines for AY 2026-2027..."
                  className="w-full px-3.5 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-green outline-none resize-none"
                  value={replaceNotes}
                  onChange={(e) => setReplaceNotes(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isReplacing}
                  onClick={() => setIsReplaceModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-xs hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReplacing || !replaceFile}
                  className="px-5 py-2.5 rounded-xl bg-primary-green text-white font-bold text-xs hover:bg-emerald-800 transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
                >
                  {isReplacing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Uploading & Logging...
                    </>
                  ) : (
                    <>
                      <UploadCloud size={15} />
                      Replace & Save Template
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ListOfRequirements;
