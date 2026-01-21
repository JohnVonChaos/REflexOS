

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
import { srgService } from './services/srgService';
import { srgDataset } from './services/srgDataset';
import { JellybeanHumanCheck } from './jelly/components/JellybeanHumanCheck';
import type { VerificationPayload } from './jelly/types';
import { ImportHistoryPanel } from './components/ImportHistoryPanel';
import { BackgroundCognitionModal } from './components/BackgroundCognitionModal';
import { KnowledgeModulesViewer } from './components/KnowledgeModulesViewer';

// Start with an empty project. User can import files as needed.
const MOCK_PROJECT_FILES: ProjectFile[] = [];

// Add this line to be able to use JSZip from window
declare const JSZip: any;

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
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
  const [isImportHistoryOpen, setIsImportHistoryOpen] = useState(false); // ADD THIS
  const [isSrgExplorerOpen, setIsSrgExplorerOpen] = useState(false);
  const [isKnowledgeModulesOpen, setIsKnowledgeModulesOpen] = useState(false);
  const [isBackgroundCognitionOpen, setIsBackgroundCognitionOpen] = useState(false);
  const [showJellybeans, setShowJellybeans] = useState(false);
  const [srgHighlightIds, setSrgHighlightIds] = useState<string[]>([]); // State for highlighted nodes
  const [diffFiles, setDiffFiles] = useState<{ file1: ProjectFile, file2: ProjectFile } | null>(null);

  // Developer/test hooks for Jellybean modal (always shows on launch now)
  useEffect(() => {
    (window as any).openJellybeanSorter = () => {
      console.debug('[DEV] openJellybeanSorter called');
      setShowJellybeans(true);
    };
    console.debug('[DEV] Jellybean sorter shows on launch. window.openJellybeanSorter() available to re-open.');

    return () => { if ((window as any).openJellybeanSorter) delete (window as any).openJellybeanSorter; };
  }, []);

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

  // Effect for Background Cognition manual trigger
  useEffect(() => {
    const handleTrigger = () => {
      console.log('[App] Received trigger-background-cycle event. Initiating Dual Process Cycle.');
      chat.runDualProcessCycleNow();
    };
    window.addEventListener('trigger-background-cycle', handleTrigger);
    return () => window.removeEventListener('trigger-background-cycle', handleTrigger);
  }, [chat.runDualProcessCycleNow]);

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

      // Load messages and session state
      if (sessionState?.messages) {
        chat.loadState(sessionState);

        // Restore SRG state (knowledge modules + hybrid corpus) if present
        if (sessionState.graphState) {
          console.log('[App] Restoring SRG state from session export...');
          await srgService.importState(sessionState.graphState);
          const stats = srgService.getCorpusStats();
          console.log(`[App] SRG restored: ${stats.totalTokens} corpus tokens, ${stats.uniqueWords} unique words`);
        }
      } else {
        throw new Error("Invalid session file format. The file must be a JSON object containing a 'messages' array.");
      }
    } catch (e: any) {
      console.error("Error importing session state:", e);
      alert(`Could not import session file: ${e.message}`);
    }
    event.target.value = '';
  };

  const handleExportState = () => {
    const srgState = srgService.exportState();
    const stats = srgService.getCorpusStats();
    console.log(`[App] Exporting SRG state: ${stats.totalTokens} corpus tokens, ${stats.uniqueWords} unique words`);

    const sessionState: SessionState = {
      messages: chat.messages,
      projectFiles: chat.projectFiles,
      contextFileIds: chat.contextFileIds,
      contextGeneratedFileNames: chat.isGeneratedFileInContext ? chat.projectFiles.filter(f => chat.isGeneratedFileInContext(f.name)).map(f => f.name) : [],
      selfNarrative: chat.selfNarrative,
      aiSettings: chat.aiSettings,
      rcb: chat.rcb,
      graphState: srgState, // Include SRG with hybrid corpus
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

  const handleJellybeanVerified = (payload: VerificationPayload) => {
    console.log('Jellybean verification complete:', payload);
    // TODO: persist or use payload (color preferences / onboarding)
    setShowJellybeans(false);
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
          onShowImportHistory={() => setIsImportHistoryOpen(true)}
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
          onShowKnowledgeModules={() => setIsKnowledgeModulesOpen(true)}
          onToggleMessageContext={chat.toggleMessageContext}
          onToggleGeneratedFileContext={chat.toggleGeneratedFileContext}
          isGeneratedFileInContext={chat.isGeneratedFileInContext}
          onShowBackgroundCognition={() => setIsBackgroundCognitionOpen(true)}
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
                  onApiTokenLimitChange={chat.onApiTokenLimitChange}
                  onApiTokenLimitMinChange={chat.onApiTokenLimitMinChange}
                  onViewTrace={handleViewTrace}
                  onClearAllContexts={chat.clearAllContexts}
                  onClearAllTrapDoorStates={chat.clearAllTrapDoorStates}
                  onFetchAllContextItems={chat.getAllContextItems}
                  onDeleteContextItem={chat.deleteContextItem}
                  onCreateWorkspace={chat.createWorkspace}
                  onGetWorkspaces={chat.getWorkspaces}
                  onLoadWorkspace={chat.loadWorkspace}
                  onCreateWorkspaceWithState={chat.createWorkspaceWithState}
                  onLoadWorkspaceWithOptions={chat.loadWorkspaceWithOptions}
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
      <BackgroundCognitionModal
        isOpen={isBackgroundCognitionOpen}
        onClose={() => setIsBackgroundCognitionOpen(false)}
        settings={chat.aiSettings}
        onUpdateSettings={chat.setAiSettings}
      />
      <KnowledgeModulesViewer
        isOpen={isKnowledgeModulesOpen}
        onClose={() => setIsKnowledgeModulesOpen(false)}
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
      {/* Jellybean Verification Modal */}
      {showJellybeans && (
        <JellybeanHumanCheck
          onVerified={handleJellybeanVerified}
          onCancel={() => setShowJellybeans(false)}
        />
      )}

      {/* Import History Panel */}
      <ImportHistoryPanel
        isOpen={isImportHistoryOpen}
        onClose={() => setIsImportHistoryOpen(false)}
        importedFiles={chat.projectFiles}
      />
    </>
  );
}

export default App;