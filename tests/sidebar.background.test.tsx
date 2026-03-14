import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Sidebar } from '../src/components/Sidebar';

describe('Sidebar Background Cognition button', () => {
  it('renders and calls handler when clicked', () => {
    const onShowBackgroundCognition = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Sidebar
          projectFiles={[]}
          generatedFiles={[]}
          selfNarrative={''}
          insights={[]}
          axioms={[]}
          onImportFiles={() => {}}
          onImportState={() => {}}
          onExportAll={() => {}}
          onExportState={() => {}}
          onCompareFiles={() => {}}
          onDeleteFiles={() => {}}
          onToggleFileContext={() => {}}
          isFileInContext={() => false}
          onShowCrystal={() => {}}
          isCrystalPanelVisible={false}
          onShowAxioms={() => {}}
          onShowInsights={() => {}}
          onShowLogs={() => {}}
          onShowSrgExplorer={() => {}}
          onShowKnowledgeModules={() => {}}
          onShowImportHistory={() => {}}
          onToggleMessageContext={() => {}}
          onToggleGeneratedFileContext={() => {}}
          isGeneratedFileInContext={() => false}
          onShowBackgroundCognition={onShowBackgroundCognition}
        />
      );
    });

    const btn = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Background Cognition')) as HTMLButtonElement | undefined;
    expect(btn).toBeTruthy();
    if (!btn) return;

    act(() => { btn.click(); });
    expect(onShowBackgroundCognition).toHaveBeenCalled();

    root.unmount();
    document.body.removeChild(container);
  });

  it('calls export state handler when Export State clicked', () => {
    const onExportState = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Sidebar
          projectFiles={[]}
          generatedFiles={[]}
          selfNarrative={''}
          insights={[]}
          axioms={[]}
          onImportFiles={() => {}}
          onImportState={() => {}}
          onExportAll={() => {}}
          onExportState={onExportState}
          onCompareFiles={() => {}}
          onDeleteFiles={() => {}}
          onToggleFileContext={() => {}}
          isFileInContext={() => false}
          onShowCrystal={() => {}}
          isCrystalPanelVisible={false}
          onShowAxioms={() => {}}
          onShowInsights={() => {}}
          onShowLogs={() => {}}
          onShowSrgExplorer={() => {}}
          onShowKnowledgeModules={() => {}}
          onShowImportHistory={() => {}}
          onToggleMessageContext={() => {}}
          onToggleGeneratedFileContext={() => {}}
          isGeneratedFileInContext={() => false}
        />
      );
    });

    const btn = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Export State')) as HTMLButtonElement | undefined;
    expect(btn).toBeTruthy();
    if (!btn) return;

    act(() => { btn.click(); });
    expect(onExportState).toHaveBeenCalled();

    root.unmount();
    document.body.removeChild(container);
  });
});
