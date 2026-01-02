import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { WorkflowDesigner } from '../src/components/WorkflowDesigner';
import { getDefaultSettings } from '../src/types';

describe('WorkflowDesigner UI', () => {
  it('allows changing backgroundRunMode for a stage and saves it', () => {
    const defaults = getDefaultSettings();
    const onClose = vi.fn();
    const setSettings = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<WorkflowDesigner isOpen={true} onClose={onClose} settings={defaults} setSettings={setSettings} />);
    });

    // Find the Background Run Mode select next to its label and change it
    const label = Array.from(container.querySelectorAll('label')).find(l => (l.textContent || '').includes('Background Run Mode')) as HTMLLabelElement | undefined;
    expect(label).toBeTruthy();
    if (!label) return;
    const select = label.parentElement?.querySelector('select') as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    if (!select) return;

    act(() => {
      select.value = 'independent';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Click Save & Close
    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Save & Close')) as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();
    act(() => {
      saveBtn.click();
    });

    expect(setSettings).toHaveBeenCalled();
    const newSettings = (setSettings as any).mock.calls[0][0];
    // the callback is passed a function - could be direct settings or a function; handle both
    let finalSettings = typeof newSettings === 'function' ? newSettings(getDefaultSettings()) : newSettings;

    const stage = finalSettings.workflow[0];
    expect(stage.backgroundRunMode).toBe('independent');

    root.unmount();
    document.body.removeChild(container);
  });
});
