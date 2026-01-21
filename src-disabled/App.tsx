

import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { useChat } from './hooks/useChat';
import type { ProjectFile, GeneratedFile, MemoryAtom, SessionState, BackgroundInsight, SRGSettings } from './types';
import { DiffViewer } from './components/DiffViewer';
import { MemoryCrystal } from './components/MemoryCrystal';
import { validateApiKey } from './services/geminiService';
import { CrystalIcon } from './components/icons';
import { AxiomsViewer } from './components/AxiomsViewer';
import { InsightsViewer } from './components/InsightsViewer';
import { LogViewer } from './components/LogViewer';
import { SRGExplorer } from './components/SRGExplorer';
import { JellybeanHumanCheck } from '../jelly/components/JellybeanHumanCheck';
import FileHud from './components/FileHud';
import BackgroundCognitionPanel from './components/BackgroundCognitionPanel';
import { ColorId } from '../jelly/types';
import { VerificationPayload } from '../jelly/types';
import { interpretSequence, storeLuescherProfile, getLatestLuescherProfile, summarizeProfile, LUSCHER_TO_COLOR } from '../services/luescherService';
import { srgService } from './services/srgService';
import { srgDataset } from './services/srgDataset';

// Start with an empty project. User can import files as needed.
const MOCK_PROJECT_FILES: ProjectFile[] = [];

// Add this line to be able to use JSZip from window
declare const JSZip: any;

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface ApiKeySelectorProps {
  onKeySelected: () => void;
}

const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onKeySelected }) => {
  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        // Assume success and notify the parent component to render the app.
        // This handles the race condition mentioned in the guidelines.
        onKeySelected();
      } catch (e) {
        console.error("Error opening API key selection:", e);
        alert("There was an error opening the API key selection dialog. Please try again.");
      }
    } else {
      alert("API key selection is not available in this environment.");
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 text-center">
        <div className="flex justify-center text-cyan-400">
             <CrystalIcon />
        </div>
        <h1 className="text-2xl font-bold text-cyan-400 mt-4">Welcome to Reflex Engine</h1>
        <p className="text-gray-300 mt-4">
          To use this application, you need to select a Google AI API key.
          Your key will be used for API calls and associated billing.
        </p>
        <p className="text-gray-400 text-sm mt-2">
          For more information, see the{' '}
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-500 hover:underline"
          >
            billing documentation
          </a>.
        </p>
        <button
          onClick={handleSelectKey}
          className="mt-8 w-full bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-cyan-700 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50"
        >
          Select API Key
        </button>
      </div>
    </div>
  );
};

type KeyState = 'unknown' | 'validating' | 'needs_selection' | 'ready' | 'error';
type SrgState = 'initializing' | 'ready' | 'error';

function App() {
  const [keyState, setKeyState] = useState<KeyState>('unknown');
  const [srgState, setSrgState] = useState<SrgState>('initializing');
  const [srgInitMessage, setSrgInitMessage] = useState('Initializing SRG...');
  const [keyError, setKeyError] = useState<string | null>(null);
  const chat = useChat(MOCK_PROJECT_FILES, keyState === 'ready' && srgState === 'ready');
  const [view, setView] = useState<'chat' | 'diff'>('chat');
  const [isCrystalPanelVisible, setIsCrystalPanelVisible] = useState(false);
  const [isAxiomsViewerOpen, setIsAxiomsViewerOpen] = useState(false);
  const [isInsightsViewerOpen, setIsInsightsViewerOpen] = useState(false);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isSrgExplorerOpen, setIsSrgExplorerOpen] = useState(false);
  const [srgHighlightIds, setSrgHighlightIds] = useState<string[]>([]); // State for highlighted nodes
  const [showJellybeans, setShowJellybeans] = useState(false);
  const [showFileHud, setShowFileHud] = useState(false);
  const [isBackgroundPanelOpen, setIsBackgroundPanelOpen] = useState(false);
  const [pendingLuscherStageIds, setPendingLuscherStageIds] = useState<string[] | null>(null);
  const [pendingLuscherMessage, setPendingLuscherMessage] = useState<string | null>(null);
  const [isImportHistoryOpen, setIsImportHistoryOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [diffFiles, setDiffFiles] = useState<{file1: ProjectFile, file2: ProjectFile} | null>(null);
  
  // Effect for SRG initialization
  useEffect(() => {
    const initializeSrg = async () => {
      try {
        setSrgInitMessage('Loading SRG Core...');
        // The SRG service now builds its graph from the dataset directly.
        await srgService.init(
          srgDataset.getTrainingTurns(), 
          srgDataset.getSynonymGroups(), 
          (msg) => setSrgInitMessage(`SRG: ${msg}`)
        );
        setSrgState('ready');
      } catch (err: any) {
        console.error("SRG Initialization failed:", err);
        setSrgInitMessage(`SRG Error: ${err.message}`);
        setSrgState('error');
      }
    };
    initializeSrg();
  }, []);

  // Effect for API Key validation
  useEffect(() => {
    const validate = async () => {
        if (!window.aistudio) {
            console.warn("aistudio environment not detected. Assuming API_KEY is set and valid.");
            setKeyState('ready');
            return;
        }

        setKeyState('validating');
        try {
            const isValid = await validateApiKey();
            if (isValid) {
                setKeyState('ready');
            } else {
                setKeyState('needs_selection');
            }
        } catch (e: any) {
            setKeyError(e.message);
            setKeyState('error');
        }
    };
    validate();
  }, []);

  const handleCompareFiles = (filesToCompare: ProjectFile[]) => {
    if (filesToCompare.length !== 2) {
        alert("Please select exactly two files to compare.");
        return;
    }
    setDiffFiles({ file1: filesToCompare[0], file2: filesToCompare[1] });
    setView('diff');
  };
  
  const handleImportFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) return;
    
    const newFiles: ProjectFile[] = [];
    for (const file of fileList) {
        try {
            const content = await file.text();
            const language = file.name.split('.').pop() || 'plaintext';
            newFiles.push({ id: uuidv4(), name: file.name, content, language, importedAt: Date.now() });
        } catch (e) {
            console.error("Error reading file:", file.name, e);
            alert(`Could not read file: ${file.name}`);
        }
    }
    chat.addFiles(newFiles);
    
    event.target.value = '';
  };

  const handleImportState = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json') {
        alert('Please select a valid JSON session file.');
        event.target.value = '';
        return;
    }

    try {
        const content = await file.text();
        const sessionState = JSON.parse(content) as Partial<SessionState>;

        // Simple graph state is no longer used, so we only load messages
        // The main SRG is pre-trained and its state is not part of the session
        if (sessionState?.messages) {
            chat.loadState(sessionState);
        } else {
            throw new Error("Invalid session file format. The file must be a JSON object containing a 'messages' array.");
        }
    } catch (e: any) {
        console.error("Error importing session state:", e);
        alert(`Could not import session file: ${e.message}`);
    }
    event.target.value = '';
  };

  // Chat import handler (line-delimited JSON or JSON array of entries)
  const chatImportInputRef = useRef<HTMLInputElement>(null);
  const handleImportChats = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      let entries: any[] = [];
      const trimmed = content.trim();
      if (trimmed.startsWith('[')) {
        entries = JSON.parse(trimmed);
      } else {
        // Line-delimited JSON
        entries = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l));
      }

      // Import entries via central service (handles mapping)
      const { importEntries } = await import('../services/chatImportService');
      const created = await importEntries(entries as any);
      showToast('success', `Imported ${created.length} chat turns`);
    } catch (e: any) {
      console.error('Failed to import chat file', e);
      showToast('error', `Failed to import chat: ${e.message}`);
    }
    event.target.value = '';
  };

  const handleExportState = () => {
    const sessionState: SessionState = {
        messages: chat.messages,
        projectFiles: chat.projectFiles,
        contextFileIds: chat.contextFileIds,
        contextGeneratedFileNames: chat.isGeneratedFileInContext ? chat.projectFiles.filter(f => chat.isGeneratedFileInContext(f.name)).map(f => f.name) : [],
        selfNarrative: chat.selfNarrative,
        aiSettings: chat.aiSettings,
        rcb: chat.rcb,
    };
    const blob = new Blob([JSON.stringify(sessionState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `reflex-session-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleExportAllGenerated = async (files: GeneratedFile[]) => {
    if (files.length === 0) return;
    const zip = new JSZip();
    files.forEach(file => {
      zip.file(file.name, file.content);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated_files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleViewTrace = (traceIds: string[]) => {
      setSrgHighlightIds(traceIds);
      setIsSrgExplorerOpen(true);
  };

  const handleSrgSettingsChange = (newSrgSettings: SRGSettings) => {
      chat.setAiSettings(prev => ({
          ...prev,
          srg: newSrgSettings
      }));
  };

  // Toast helper
  const showToast = (type: 'info' | 'success' | 'error', message: string, timeout = 3500) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), timeout);
  };

  // Listen for refresh events from the orchestrator and show the jellybean sorter
  useEffect(() => {
    const handleRefreshNeeded = (_e: Event) => {
      setShowJellybeans(true);
      showToast('info', 'Time for a quick color sort—keeps things aligned. Ready?');
    };
    window.addEventListener('luscher:refresh-needed', handleRefreshNeeded as EventListener);
    return () => window.removeEventListener('luscher:refresh-needed', handleRefreshNeeded as EventListener);
  }, []);

  // Listen for explicit workflow Lüscher requirements
  useEffect(() => {
    const handleRequire = (e: any) => {
      const detail = e?.detail || {};
      const stageIds = detail.stageIds || [];
      const message = detail.message || null;
      setPendingLuscherStageIds(stageIds);
      setPendingLuscherMessage(message);
      setShowJellybeans(true);
      showToast('info', 'This workflow requires a Lüscher intake before continuing. Please sort the jelly beans.');
    };
    window.addEventListener('luscher:require-workflow', handleRequire as EventListener);
    return () => window.removeEventListener('luscher:require-workflow', handleRequire as EventListener);
  }, []);

  // On first run, prompt user to do initial jelly bean setup if no profile exists
  useEffect(() => {
    const checkFirstRun = async () => {
      try {
        console.debug('[Lüscher] Checking for existing profile...');
        const profile = await getLatestLuescherProfile();
        console.debug('[Lüscher] Latest profile:', profile);
        if (!profile) {
          console.debug('[Lüscher] No profile found — showing onboarding.');
          setShowJellybeans(true);
          showToast('info', 'Quick setup: Sort these jelly beans by preference');
        }
        // Developer/test hook: if URL param marbleTest=1, open marbles sorter and simulate a verification after a short delay
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get('marbleTest') === '1') {
            console.debug('[Lüscher] marbleTest param present — running automated test');
            setShowJellybeans(true);
            showToast('info', 'Running marble onboarding test');
            setTimeout(() => {
              // Simulate a perfect sequence (all colors in a fixed order)
              const seq = [ColorId.BLUE, ColorId.GREEN, ColorId.RED, ColorId.YELLOW, ColorId.VIOLET, ColorId.BROWN, ColorId.BLACK, ColorId.GREY];
              const fakeTrace = { paths: [], durations: Object.fromEntries(seq.map(s => [s, 100])), errors: [] } as any;
              handleVerified({ sequence: seq, trace: fakeTrace });
            }, 1200);
          }
        } catch (e) {
          // ignore
        }
      } catch (e) {
        // If we can't read the profile (IndexedDB unavailable or other error),
        // still show the onboarding sorter so user can set preferences now.
        console.warn('Failed to check Lüscher profile on startup — falling back to onboarding', e);
        setShowJellybeans(true);
        showToast('info', 'Quick setup: Sort these jelly beans by preference');
      }
    };
    checkFirstRun();
  }, []);

  // Expose a console helper for debugging in dev mode
  useEffect(() => {
      if (import.meta.env.DEV) {
      (window as any).openMarbleSorter = () => {
        console.debug('[DEV] openMarbleSorter called');
        setShowJellybeans(true);
      };
      console.debug('[DEV] openMarbleSorter is available on window');
    }
    return () => { if ((window as any).openMarbleSorter) delete (window as any).openMarbleSorter; };
  }, []);

  // Log when modal visibility changes (help debug z-index/visibility issues)
  useEffect(() => {
    console.debug('[Lüscher] showJellybeans state changed:', showJellybeans);
  }, [showJellybeans]);

  const handleVerified = async (payload: VerificationPayload) => {
    try {
      const profile = interpretSequence(payload.sequence);
      if (import.meta.env.DEV) {
        console.log(summarizeProfile(profile));
      }
      await storeLuescherProfile(profile);
      // If this verification was requested as part of a workflow gate, persist lastLuscher into workflow(s)
          if (pendingLuscherStageIds && pendingLuscherStageIds.length > 0) {
        try {
          // Normalize sequence to color names (e.g., GREY, BLACK)
          const seqNames = payload.sequence.map(s => {
            if (typeof s === 'number') {
              // map numeric Lüscher index to ColorId string
              return LUSCHER_TO_COLOR[s] || String(s);
            }
            return String(s).toUpperCase();
          });
          const timing: Record<string, number> = {};
          const durations = payload.trace?.durations || {};
          for (const k of Object.keys(durations)) {
            const keyName = (typeof k === 'number') ? (LUSCHER_TO_COLOR[Number(k)] || String(k)) : String(k).toUpperCase();
            timing[keyName] = durations[k];
          }

          const luscherResult = {
            sequence: seqNames,
            timingMs: timing,
            takenAt: new Date().toISOString()
          } as any;
          // update ai settings for each stage id
          chat.setAiSettings(prev => {
            const newSettings = { ...prev };
            newSettings.workflow = newSettings.workflow.map(stage => pendingLuscherStageIds!.includes(stage.id) ? { ...stage, lastLuscher: luscherResult } : stage);
            return newSettings;
          });
          showToast('success', 'Lüscher intake saved to workflow configuration. Proceeding...');
          // If we have a pending message, send it now
          if (pendingLuscherMessage) {
            const msg = pendingLuscherMessage;
            setPendingLuscherMessage(null);
            setPendingLuscherStageIds(null);
            // slight delay to allow UI update
            setTimeout(() => chat.sendMessage(msg), 200);
          }
        } catch (e) {
          console.warn('Failed to persist Lüscher result to workflow(s)', e);
        }
      }
      showToast('success', 'Preferences updated');
      setShowJellybeans(false);
    } catch (err) {
      console.error('Failed to persist Lüscher profile', err);
      showToast('error', 'Could not save preferences');
    }
  };

  if (keyState === 'unknown' || keyState === 'validating' || srgState === 'initializing' || srgState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-cyan-400">
            <CrystalIcon />
        </div>
        <h1 className="text-xl font-bold text-cyan-400 mt-4 animate-pulse">
          {srgState === 'error' ? 'SRG Initialization Failed' : (keyState === 'validating' ? 'Validating API Key...' : srgInitMessage)}
        </h1>
        {srgState === 'error' && <p className="text-red-400 mt-2">{srgInitMessage}</p>}
      </div>
    );
  }

  if (keyState === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
          <div className="max-w-md w-full bg-red-900/50 p-8 rounded-lg border border-red-700 text-center">
              <h1 className="text-2xl font-bold text-red-300">Initialization Failed</h1>
              <p className="text-red-200 mt-4">{keyError}</p>
              <button onClick={() => window.location.reload()} className="mt-8 w-full bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50">
                  Retry
              </button>
          </div>
      </div>
    );
  }

  if (keyState === 'needs_selection') {
    return <ApiKeySelector onKeySelected={() => setKeyState('ready')} />;
  }

  const generatedFiles = chat.messages.flatMap(m => m.generatedFiles || []);
  const backgroundInsightAtoms = chat.messages
    .filter((m): m is MemoryAtom & { backgroundInsight: BackgroundInsight } => m.type === 'steward_note' && !!m.backgroundInsight)
    .sort((a, b) => b.backgroundInsight!.timestamp - a.backgroundInsight!.timestamp); // Sort with newest first
  
  const allAxioms = chat.messages
    .filter(m => m.type === 'axiom')
    .sort((a, b) => b.timestamp - a.timestamp);


  return (
    <>
      <main className="flex h-screen bg-gray-900 text-white font-sans">
        <Sidebar 
          projectFiles={chat.projectFiles}
          generatedFiles={generatedFiles}
          selfNarrative={chat.selfNarrative}
          insights={backgroundInsightAtoms}
          axioms={allAxioms}
          onImportFiles={handleImportFiles}
          onImportState={handleImportState}
          onImportChats={handleImportChats}
          // Repurpose the sidebar "Import History" button to open the Lüscher calibration (jellybean) modal
          onShowImportHistory={() => setShowJellybeans(true)}
          onDeleteFiles={chat.deleteFiles}
          onCompareFiles={handleCompareFiles}
          onToggleFileContext={chat.toggleProjectFileContext}
          isFileInContext={chat.isFileInContext}
          onExportAll={() => handleExportAllGenerated(generatedFiles)}
          onExportState={handleExportState}
          onShowCrystal={() => setIsCrystalPanelVisible(prev => !prev)}
          isCrystalPanelVisible={isCrystalPanelVisible}
          onShowAxioms={() => setIsAxiomsViewerOpen(true)}
          onShowInsights={() => setIsInsightsViewerOpen(true)}
          onShowLogs={() => setIsLogViewerOpen(true)}
          onShowSrgExplorer={() => { setSrgHighlightIds([]); setIsSrgExplorerOpen(true); }}
          onShowFileHud={() => setShowFileHud(true)}
          onShowBackgroundCognition={() => setIsBackgroundPanelOpen(true)}
          onToggleMessageContext={chat.toggleMessageContext}
          onToggleGeneratedFileContext={chat.toggleGeneratedFileContext}
          isGeneratedFileInContext={chat.isGeneratedFileInContext}
        />
        <div className="flex-1 flex min-w-0">
          {view === 'diff' && diffFiles ? (
              <DiffViewer file1={diffFiles.file1} file2={diffFiles.file2} onExit={() => setView('chat')} />
          ) : (
            <>
              <div className="flex-1 flex flex-col min-w-0">
                  <ChatPanel 
                      messages={chat.messages}
                      projectFiles={chat.projectFiles}
                      sendMessage={chat.sendMessage}
                      isLoading={chat.isLoading}
                      loadingStage={chat.loadingStage}
                      error={chat.error}
                      onToggleMessageContext={chat.toggleMessageContext}
                      onStopGeneration={chat.stopGeneration}
                      contextFileIds={chat.contextFileIds}
                      onToggleFileContext={chat.toggleProjectFileContext}
                      totalContextTokens={chat.totalContextTokens}
                      onToggleMessageCollapsed={chat.toggleMessageCollapsed}
                      onCollapseAll={chat.collapseAllMessages}
                      onExpandAll={chat.expandAllMessages}
                      onClearChat={chat.clearChat}
                      aiSettings={chat.aiSettings}
                      setAiSettings={chat.setAiSettings}
                      isCognitionRunning={chat.isCognitionRunning}
                      onRunCognitionNow={chat.runCognitionCycleNow}
                      rcb={chat.rcb}
                      onRcbSizeLimitChange={chat.onRcbSizeLimitChange}
                      onClearAllContexts={chat.clearAllContexts}
                      onClearAllTrapDoorStates={chat.clearAllTrapDoorStates}
                      onFetchAllContextItems={chat.getAllContextItems}
                      onDeleteContextItem={chat.deleteContextItem}
                      onCreateWorkspace={chat.createWorkspace}
                      onGetWorkspaces={chat.getWorkspaces}
                      onLoadWorkspace={chat.loadWorkspace}
                      onViewTrace={handleViewTrace}
                  />
              </div>
              {isCrystalPanelVisible && (
                <div className="flex-shrink-0 w-2/5 min-w-[400px] max-w-[600px] flex flex-col border-l border-gray-700/50 bg-gray-800">
                  <MemoryCrystal 
                    atoms={chat.messages} 
                    onExit={() => setIsCrystalPanelVisible(false)} 
                  />
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <AxiomsViewer
        isOpen={isAxiomsViewerOpen}
        onClose={() => setIsAxiomsViewerOpen(false)}
        axioms={allAxioms}
        onToggleContext={chat.toggleMessageContext}
      />
      <InsightsViewer
        isOpen={isInsightsViewerOpen}
        onClose={() => setIsInsightsViewerOpen(false)}
        insights={backgroundInsightAtoms}
        onToggleContext={chat.toggleMessageContext}
      />
      <LogViewer
        isOpen={isLogViewerOpen}
        onClose={() => setIsLogViewerOpen(false)}
      />
      {srgState === 'ready' && (
        <SRGExplorer
          isOpen={isSrgExplorerOpen}
          onClose={() => setIsSrgExplorerOpen(false)}
          highlightNodeIds={srgHighlightIds}
          settings={chat.aiSettings.srg}
          onSettingsChange={handleSrgSettingsChange}
        />
      )}
      {/* Jellybean sorter modal (Lüscher) */}
      {showJellybeans && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-50 w-full max-w-3xl p-4 flex items-center justify-center">
            <JellybeanHumanCheck 
              onVerified={handleVerified} 
              onCancel={() => { setShowJellybeans(false); showToast('info', 'Cancelled'); }}
            />
          </div>
        </div>
      )}

      {/* File HUD */}
      {showFileHud && (
        <div className="fixed inset-0 z-60 flex items-start justify-center p-6">
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-50 w-full max-w-4xl p-4">
            <FileHud onClose={() => setShowFileHud(false)} />
          </div>
        </div>
      )}

      {isBackgroundPanelOpen && (
        <BackgroundCognitionPanel
          isOpen={isBackgroundPanelOpen}
          onClose={() => setIsBackgroundPanelOpen(false)}
          settings={chat.aiSettings}
          setSettings={chat.setAiSettings}
          isCognitionRunning={chat.isCognitionRunning}
          onRunCognitionNow={() => chat.runCognitionCycleNow(true)}
        />
      )}

      {/* Simple toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-60 p-3 rounded shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-sky-600' } text-white`}> 
          {toast.message}
        </div>
      )}
    </>
  );
}

export default App;