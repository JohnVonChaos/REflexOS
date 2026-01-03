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
    // Open Configure Inputs and toggle Luscher intake
    const configureBtn = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Configure Inputs')) as HTMLButtonElement;
    expect(configureBtn).toBeTruthy();
    if (!configureBtn) return;
    act(() => { configureBtn.click(); });

    const luscherCheckbox = Array.from(container.querySelectorAll('input')).find(i => (i as HTMLInputElement).type === 'checkbox' && (i as HTMLInputElement).checked === false && (i as HTMLInputElement).nextSibling && ((i as HTMLInputElement).nextSibling as Element).textContent?.includes('Lüscher')) as HTMLInputElement | undefined;
    expect(luscherCheckbox).toBeTruthy();
    if (!luscherCheckbox) return;

    // Toggle Lüscher on
    act(() => { luscherCheckbox.click(); });

    // Save & Close
    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes('Save & Close')) as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();
    act(() => { saveBtn.click(); });

    expect(setSettings).toHaveBeenCalled();
    const newSettings = (setSettings as any).mock.calls[0][0];
    let finalSettings = typeof newSettings === 'function' ? newSettings(getDefaultSettings()) : newSettings;
    const stage = finalSettings.workflow[0];
    expect(stage.useLuscherIntake).toBeTruthy();

    root.unmount();
    document.body.removeChild(container);
  });
});
