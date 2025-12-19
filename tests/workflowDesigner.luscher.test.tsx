import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { WorkflowDesigner } from '../components/WorkflowDesigner';
import { getDefaultSettings } from '../src/types';

describe('WorkflowDesigner Lüscher button', () => {
  it('shows Lüscher checkbox in Configure Inputs and saves it on Save & Close', () => {
    const defaults = getDefaultSettings();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onClose = vi.fn();
    const setSettings = vi.fn();

    act(() => {
      root.render(<WorkflowDesigner isOpen={true} onClose={onClose} settings={defaults} setSettings={setSettings} />);
    });

    // Expand the first stage's Configure Inputs
    const configureBtns = Array.from(container.querySelectorAll('button')).filter(b => (b.textContent || '').includes('Configure Inputs'));
    expect(configureBtns.length).toBeGreaterThan(0);
    const configureBtn = configureBtns[0];
    act(() => { configureBtn.click(); });

    // Find the Lüscher checkbox in the inputs panel
    const luscherLabel = Array.from(container.querySelectorAll('label')).find(l => (l.textContent || '').includes('Include Lüscher')) as HTMLLabelElement | undefined;
    expect(luscherLabel).toBeTruthy();
    if (!luscherLabel) return;
    const luscherCheckbox = luscherLabel.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(luscherCheckbox).toBeTruthy();
    if (!luscherCheckbox) return;

    act(() => {
      luscherCheckbox.click();
    });

    // Save & Close
    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Save & Close')) as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();
    act(() => { saveBtn.click(); });

    expect(setSettings).toHaveBeenCalled();
    const newSettings = (setSettings as any).mock.calls[0][0];
    let finalSettings = typeof newSettings === 'function' ? newSettings(getDefaultSettings()) : newSettings;
    const stage = finalSettings.workflow[0];
    expect(stage.useLuscherIntake).toBe(true);

    root.unmount();
    document.body.removeChild(container);
  });
});
