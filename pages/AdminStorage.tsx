import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  uploadToS3,
  listS3Objects, 
  deleteS3Object, 
  deleteS3Objects, 
  isS3Configured, 
  S3FileItem 
} from '../services/s3Service';
import { useTheme } from '../context/ThemeContext';
import { 
  ArrowLeft, 
  Database, 
  Video, 
  FileText, 
  Image as ImageIcon, 
  Music, 
  Trash2, 
  RefreshCw, 
  Search, 
  Filter, 
  Calendar, 
  CheckSquare, 
  Square, 
  ExternalLink, 
  AlertTriangle, 
  HardDrive, 
  ShieldAlert,
  Upload,
  Copy,
  Check
} from 'lucide-react';

export default function AdminStorage() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const [files, setFiles] = useState<S3FileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Video' | 'Resume' | 'Image' | 'Audio' | 'Other'>('All');
  const [ageFilter, setAgeFilter] = useState<'all' | '7days' | '30days' | '90days'>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
  const [deleteConfirmBucket, setDeleteConfirmBucket] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fileId = (file: S3FileItem) => `${file.bucket}::${file.key}`;
  const parseFileId = (id: string) => {
    const idx = id.indexOf('::');
    if (idx === -1) return { bucket: undefined as string | undefined, key: id };
    return { bucket: id.slice(0, idx), key: id.slice(idx + 2) };
  };

  // Test Upload State
  const [testFile, setTestFile] = useState<File | null>(null);
  const [isTestUploading, setIsTestUploading] = useState<boolean>(false);
  const [testResultUrl, setTestResultUrl] = useState<string | null>(null);
  const [testCopied, setTestCopied] = useState<boolean>(false);

  const handleTestUpload = async () => {
    if (!testFile) return;
    setIsTestUploading(true);
    setTestResultUrl(null);
    try {
      const url = await uploadToS3(testFile, 'auto', testFile.name);
      setTestResultUrl(url);
      showToast('Uploaded successfully to S3!');
      fetchFiles();
    } catch (err: any) {
      console.error('Test upload error:', err);
      showToast('Upload failed: ' + (err.message || 'Check credentials / CORS policy'));
    } finally {
      setIsTestUploading(false);
    }
  };

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const data = await listS3Objects();
      setFiles(data);
      setSelectedKeys(new Set());
    } catch (err) {
      console.error("Failed to load S3 objects:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Filtered files
  const filteredFiles = files.filter(file => {
    // Search query filter
    const matchesSearch = file.key.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Category filter
    const matchesCategory = categoryFilter === 'All' || file.category === categoryFilter;

    // Age filter
    let matchesAge = true;
    if (ageFilter === '7days') {
      matchesAge = file.ageInDays >= 7;
    } else if (ageFilter === '30days') {
      matchesAge = file.ageInDays >= 30;
    } else if (ageFilter === '90days') {
      matchesAge = file.ageInDays >= 90;
    }

    return matchesSearch && matchesCategory && matchesAge;
  });

  // Calculate metrics
  const totalFiles = files.length;
  const totalSizeBytes = files.reduce((acc, f) => acc + f.size, 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
  const videoFiles = files.filter(f => f.category === 'Video');
  const videoSizeBytes = videoFiles.reduce((acc, f) => acc + f.size, 0);
  const videoSizeMB = (videoSizeBytes / (1024 * 1024)).toFixed(2);

  const resumeFiles = files.filter(f => f.category === 'Resume');
  const resumeSizeBytes = resumeFiles.reduce((acc, f) => acc + f.size, 0);
  const resumeSizeMB = (resumeSizeBytes / (1024 * 1024)).toFixed(2);

  // Selection logic
  const toggleSelectAll = () => {
    if (selectedKeys.size === filteredFiles.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredFiles.map(f => fileId(f))));
    }
  };

  const toggleSelectKey = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedKeys(next);
  };

  // Single delete
  const handleDeleteSingle = async (key: string, bucket?: string) => {
    setIsDeleting(true);
    const ok = await deleteS3Object(key, bucket);
    setIsDeleting(false);
    setDeleteConfirmKey(null);
    setDeleteConfirmBucket(null);
    if (ok) {
      showToast(`Deleted file: ${key}`);
      fetchFiles();
    } else {
      showToast(`Failed to delete file from S3.`);
    }
  };

  // Bulk delete
  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedKeys);
    if (ids.length === 0) return;

    setIsDeleting(true);
    let deletedCount = 0;
    const byBucket = new Map<string | undefined, string[]>();
    for (const id of ids) {
      const { bucket, key } = parseFileId(id);
      const list = byBucket.get(bucket) || [];
      list.push(key);
      byBucket.set(bucket, list);
    }
    for (const [bucket, keys] of byBucket.entries()) {
      deletedCount += await deleteS3Objects(keys, bucket);
    }
    setIsDeleting(false);
    setShowBulkDeleteConfirm(false);

    if (deletedCount > 0) {
      showToast(`Successfully deleted ${deletedCount} files from Amazon S3 bucket.`);
      fetchFiles();
    } else {
      showToast(`Failed to bulk delete files.`);
    }
  };

  // Format File Size
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const s3Configured = isS3Configured();

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0a0a0a] text-white' : 'bg-gray-50 text-gray-900'} transition-colors duration-200`}>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-[120] bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-white/20 text-sm font-bold flex items-center gap-2 animate-bounce">
          <Database size={18} className="text-blue-400" />
          {toastMsg}
        </div>
      )}

      {/* Header Bar */}
      <div className={`border-b ${isDark ? 'border-white/10 bg-[#111]' : 'border-gray-200 bg-white'} px-6 py-4 sticky top-0 z-40`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/admin')}
              className={`p-2 rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-100'}`}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black flex items-center gap-2 tracking-tight">
                <Database size={24} className="text-blue-500" />
                Amazon S3 Document Storage Manager
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Manage, filter, and purge video resumes, documents, and media assets stored in AWS S3.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border ${s3Configured ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'}`}>
              <span className={`w-2 h-2 rounded-full ${s3Configured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              {s3Configured ? 'AWS S3 Connected' : 'S3 Keys Missing (.env)'}
            </div>

            <button
              onClick={fetchFiles}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh S3
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {!s3Configured && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-amber-700 dark:text-amber-400 text-sm font-semibold">
            <AlertTriangle size={24} className="shrink-0" />
            <div>
              <p className="font-bold">AWS S3 Access Credentials Not Set</p>
              <p className="text-xs opacity-90 mt-0.5">Add <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">VITE_AWS_S3_ACCESS_KEY_ID</code> and <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded">VITE_AWS_S3_SECRET_ACCESS_KEY</code> in your <code className="font-mono">.env</code> file to enable direct bucket manipulation.</p>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total S3 Storage</span>
              <HardDrive size={20} className="text-blue-500" />
            </div>
            <h3 className="text-3xl font-black tracking-tight">{totalSizeMB} MB</h3>
            <p className="text-xs text-gray-500 mt-1">{totalFiles} total stored files</p>
          </div>

          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Video Resumes & Media</span>
              <Video size={20} className="text-purple-500" />
            </div>
            <h3 className="text-3xl font-black tracking-tight text-purple-600 dark:text-purple-400">{videoSizeMB} MB</h3>
            <p className="text-xs text-gray-500 mt-1">{videoFiles.length} video recordings</p>
          </div>

          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Documents & Resumes</span>
              <FileText size={20} className="text-emerald-500" />
            </div>
            <h3 className="text-3xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">{resumeSizeMB} MB</h3>
            <p className="text-xs text-gray-500 mt-1">{resumeFiles.length} resume files</p>
          </div>
        </div>

        {/* Test Upload Widget */}
        <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Upload size={18} className="text-blue-500" />
                Test AWS S3 Upload & Link Verification
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Upload any file (resume, video, image) to verify S3 permissions and get an instant public S3 URL link.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input 
              type="file" 
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  setTestFile(e.target.files[0]);
                  setTestResultUrl(null);
                }
              }}
              className={`flex-1 p-2 border rounded-xl text-xs outline-none ${isDark ? 'bg-black border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
            />
            <button
              onClick={handleTestUpload}
              disabled={!testFile || isTestUploading}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              {isTestUploading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Uploading to S3...
                </>
              ) : (
                <>
                  <Upload size={14} /> Upload & Get S3 Link
                </>
              )}
            </button>
          </div>

          {/* Test Link Output */}
          {testResultUrl && (
            <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 animate-fade-in">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <Check size={16} /> File Uploaded to AWS S3 Successfully!
                </span>
                <a 
                  href={testResultUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  Test Link in New Tab <ExternalLink size={12} />
                </a>
              </div>
              <div className="flex items-center gap-2 bg-white dark:bg-black p-2.5 rounded-lg border border-emerald-500/20">
                <input 
                  type="text" 
                  readOnly 
                  value={testResultUrl} 
                  className="w-full bg-transparent text-xs font-mono outline-none text-gray-800 dark:text-gray-200"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(testResultUrl);
                    setTestCopied(true);
                    setTimeout(() => setTestCopied(false), 2000);
                  }}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md text-[11px] font-bold hover:bg-blue-700 transition-colors shrink-0 flex items-center gap-1"
                >
                  {testCopied ? <Check size={12} /> : <Copy size={12} />}
                  {testCopied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filters & Actions Bar */}
        <div className={`p-5 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm space-y-4`}>
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search file name or path..."
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all ${isDark ? 'bg-black border-white/10 text-white focus:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'}`}
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
              {(['All', 'Video', 'Resume', 'Image', 'Audio', 'Other'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${categoryFilter === cat ? 'bg-blue-600 text-white shadow-sm' : isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Age Filter Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <Calendar size={16} className="text-gray-400" />
              <select
                value={ageFilter}
                onChange={e => setAgeFilter(e.target.value as any)}
                className={`p-2.5 rounded-xl border text-xs font-bold outline-none cursor-pointer ${isDark ? 'bg-black border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
              >
                <option value="all">All File Ages</option>
                <option value="7days">Older than 7 days</option>
                <option value="30days">Older than 30 days</option>
                <option value="90days">Older than 90 days</option>
              </select>
            </div>

          </div>

          {/* Bulk Actions Line */}
          {selectedKeys.size > 0 && (
            <div className="pt-3 border-t border-gray-200 dark:border-white/10 flex justify-between items-center animate-fade-in">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                {selectedKeys.size} file(s) selected
              </span>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-red-700 transition-all flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Delete Selected Files
              </button>
            </div>
          )}
        </div>

        {/* File List Table */}
        <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'}`}>
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-3"></div>
              <p className="text-xs text-gray-500 font-bold">Scanning Amazon S3 Bucket Objects...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="py-16 text-center">
              <Database size={48} className="mx-auto text-gray-400 opacity-40 mb-3" />
              <h4 className="font-bold text-base">No S3 Storage Files Found</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                No files match your search criteria or the S3 bucket is empty.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-white/10 bg-white/5 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'} font-bold uppercase tracking-wider text-[10px]`}>
                    <th className="p-4 w-10 text-center">
                      <button onClick={toggleSelectAll} className="cursor-pointer">
                        {selectedKeys.size === filteredFiles.length && filteredFiles.length > 0 ? (
                          <CheckSquare size={16} className="text-blue-500" />
                        ) : (
                          <Square size={16} className="text-gray-400" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">File Name / Key</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Upload Date & Age</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
                  {filteredFiles.map((file) => {
                    const id = fileId(file);
                    const isSelected = selectedKeys.has(id);
                    return (
                      <tr 
                        key={id} 
                        className={`transition-colors ${isSelected ? (isDark ? 'bg-blue-500/10' : 'bg-blue-50/60') : (isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50')}`}
                      >
                        <td className="p-4 text-center">
                          <button onClick={() => toggleSelectKey(id)} className="cursor-pointer">
                            {isSelected ? (
                              <CheckSquare size={16} className="text-blue-500" />
                            ) : (
                              <Square size={16} className="text-gray-400" />
                            )}
                          </button>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                            file.category === 'Video' ? 'bg-purple-500/10 text-purple-600 border border-purple-500/30' :
                            file.category === 'Resume' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' :
                            file.category === 'Image' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/30' :
                            'bg-gray-500/10 text-gray-600 border border-gray-500/30'
                          }`}>
                            {file.category === 'Video' && <Video size={12} />}
                            {file.category === 'Resume' && <FileText size={12} />}
                            {file.category === 'Image' && <ImageIcon size={12} />}
                            {file.category === 'Audio' && <Music size={12} />}
                            {file.category}
                          </span>
                        </td>

                        <td className="py-3 px-4 max-w-xs truncate font-medium font-mono text-gray-800 dark:text-gray-200" title={file.key}>
                          {file.key}
                        </td>

                        <td className="py-3 px-4 font-mono font-bold">
                          {formatSize(file.size)}
                        </td>

                        <td className="py-3 px-4 text-gray-500">
                          <div>{new Date(file.lastModified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                          <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{file.ageInDays} day(s) old</div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                              title="Preview File"
                            >
                              <ExternalLink size={16} />
                            </a>
                            <button
                              onClick={() => {
                                setDeleteConfirmKey(file.key);
                                setDeleteConfirmBucket(file.bucket);
                              }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                              title="Delete File"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete Single File Confirmation Modal */}
      {deleteConfirmKey && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`max-w-md w-full p-6 rounded-2xl shadow-2xl border ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white text-gray-900'}`}>
            <div className="flex items-center gap-3 text-red-500 mb-3">
              <ShieldAlert size={28} />
              <h3 className="text-lg font-black tracking-tight">Confirm File Deletion</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              Are you sure you want to permanently delete this object from your AWS S3 bucket?
            </p>
            <div className="p-3 bg-gray-100 dark:bg-white/5 rounded-xl font-mono text-xs break-all mb-6 border border-gray-200 dark:border-white/10">
              {deleteConfirmKey}
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setDeleteConfirmKey(null);
                  setDeleteConfirmBucket(null);
                }}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-white/20 font-bold text-xs hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSingle(deleteConfirmKey, deleteConfirmBucket || undefined)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Bulk Selected Files Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`max-w-md w-full p-6 rounded-2xl shadow-2xl border ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white text-gray-900'}`}>
            <div className="flex items-center gap-3 text-red-500 mb-3">
              <ShieldAlert size={28} />
              <h3 className="text-lg font-black tracking-tight">Bulk Delete S3 Objects</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              You are about to permanently delete <strong className="text-red-500">{selectedKeys.size} selected file(s)</strong> from Amazon S3. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-white/20 font-bold text-xs hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                {isDeleting ? 'Deleting...' : `Delete ${selectedKeys.size} Files`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
