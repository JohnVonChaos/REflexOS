import React, { useState, useEffect } from 'react';
import { ChevronDownIcon, SaveIcon, LoadIcon, TrashIcon, RefreshIcon } from './icons';
import { workflowProfileManager, WorkflowProfile } from '../services/workflowProfileManager';

const ProfileSelector: React.FC<{
  currentProfileId?: string;
  onProfileLoad: (profile: WorkflowProfile) => void;
  onProfileSave: (name: string, tags?: string[]) => Promise<void>;
  isLoading?: boolean;
}> = ({ currentProfileId, onProfileLoad, onProfileSave, isLoading = false }) => {
  const [profiles, setProfiles] = useState<WorkflowProfile[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileTags, setNewProfileTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshProfiles = async () => {
    setIsRefreshing(true);
    try {
      const list = await workflowProfileManager.listProfiles();
      setProfiles(list);
    } catch (e) {
      console.error('Failed to load profiles:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshProfiles();
  }, []);

  const handleLoadProfile = async (profile: WorkflowProfile) => {
    onProfileLoad(profile);
    setIsOpen(false);
  };

  const handleSaveProfile = async () => {
    if (!newProfileName.trim()) return;

    setIsSaving(true);
    try {
      const tags = newProfileTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      
      await onProfileSave(newProfileName, tags);
      setNewProfileName('');
      setNewProfileTags('');
      setShowSaveDialog(false);
      await refreshProfiles();
    } catch (e) {
      console.error('Failed to save profile:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this profile? This cannot be undone.')) return;

    try {
      await workflowProfileManager.deleteProfile(id);
      await refreshProfiles();
    } catch (e) {
      console.error('Failed to delete profile:', e);
    }
  };

  const currentProfile = profiles.find(p => p.id === currentProfileId);

  return (
    <div className="relative">
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm transition"
      >
        <span className="truncate max-w-[150px]">
          {currentProfile ? `Profile: ${currentProfile.name}` : 'Load Profile'}
        </span>
        <div className={`transition transform ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDownIcon size={16} />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-40 min-w-[300px] max-h-[400px] flex flex-col">
          {/* Header */}
          <div className="border-b border-slate-700 px-4 py-3 flex items-center justify-between">
            <h3 className="font-medium text-white text-sm">Workflow Profiles</h3>
            <button
              onClick={() => {
                refreshProfiles();
              }}
              disabled={isRefreshing}
              title="Refresh profiles"
              className="p-1 hover:bg-slate-700 rounded disabled:opacity-50 transition"
            >
              <div className={`text-slate-300 w-4 h-4 inline-block ${isRefreshing ? 'animate-spin' : ''}`}>
                <RefreshIcon />
              </div>
            </button>
          </div>

          {/* Profile List */}
          <div className="overflow-y-auto flex-1">
            {profiles.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400 text-sm">
                No profiles yet. Save your current workflow as a profile.
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    onClick={() => handleLoadProfile(profile)}
                    className={`px-4 py-3 cursor-pointer hover:bg-slate-700/50 transition border-l-2 ${
                      currentProfileId === profile.id
                        ? 'border-l-purple-500 bg-slate-700/30'
                        : 'border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white text-sm truncate">
                          {profile.name}
                        </h4>
                        {profile.description && (
                          <p className="text-xs text-slate-400 truncate mt-1">
                            {profile.description}
                          </p>
                        )}
                        {profile.tags && profile.tags.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {profile.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-block px-2 py-0.5 text-xs bg-slate-600 text-slate-200 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-slate-500 mt-2">
                          Updated: {new Date(profile.updatedAt).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={(e) => handleDeleteProfile(profile.id, e)}
                        title="Delete profile"
                        className="ml-2 p-1 hover:bg-red-600/20 rounded transition text-slate-400 hover:text-red-400"
                      >
                        <div className="w-4 h-4 inline-block">
                          <TrashIcon />
                        </div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer with Save Button */}
          <div className="border-t border-slate-700 px-4 py-3">
            <button
              onClick={() => setShowSaveDialog(true)}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition"
            >
              <div className="w-4 h-4 inline-block">
                <SaveIcon />
              </div>
              Save Current as Profile
            </button>
          </div>
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg shadow-xl max-w-sm w-full space-y-4 p-6">
            <h3 className="text-lg font-bold text-white">Save Workflow Profile</h3>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Profile Name
              </label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g., Analysis Mode, Quick Response, Deep Thinking"
                autoFocus
                className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Tags (comma-separated, optional)
              </label>
              <input
                type="text"
                value={newProfileTags}
                onChange={(e) => setNewProfileTags(e.target.value)}
                placeholder="e.g., creative, technical, quick"
                className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setNewProfileName('');
                  setNewProfileTags('');
                }}
                disabled={isSaving}
                className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSaving || !newProfileName.trim()}
                className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition"
              >
                {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSelector;
