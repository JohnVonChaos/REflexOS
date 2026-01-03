import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { WorkflowDesigner } from '../src/components/WorkflowDesigner';
import { getDefaultSettings } from '../src/types';

describe('WorkflowDesigner UI', () => {
  it('does not surface background scheduling controls in the Workflow Designer', () => {
    const defaults = getDefaultSettings();
    const onClose = vi.fn();
    const setSettings = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<WorkflowDesigner isOpen={true} onClose={onClose} settings={defaults} setSettings={setSettings} />);
    });

    // Background scheduling should be configured in the Background Cognition UI, not here
    const label = Array.from(container.querySelectorAll('label')).find(l => (l.textContent || '').includes('Background Run Mode')) as HTMLLabelElement | undefined;
    expect(label).toBeUndefined();

    root.unmount();
    document.body.removeChild(container);
  });
});
