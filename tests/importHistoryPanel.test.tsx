import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ImportHistoryPanel } from '../components/ImportHistoryPanel';
import type { ProjectFile } from '../types';

describe('ImportHistoryPanel', () => {
  it('renders a list of imported files and calls onClose', () => {
    const files: ProjectFile[] = [
      { id: 'f1', name: 'a.txt', content: 'a', language: 'text', importedAt: 1000 },
      { id: 'f2', name: 'b.txt', content: 'b', language: 'text', importedAt: 2000 }
    ] as any;

    const onClose = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<ImportHistoryPanel isOpen={true} onClose={onClose} importedFiles={files} />);
    });

    // should show file names
    expect(container.textContent).toContain('a.txt');
    expect(container.textContent).toContain('b.txt');

    // close button works
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    act(() => {
      (btn as HTMLButtonElement).click();
    });
    expect(onClose).toHaveBeenCalled();

    root.unmount();
    document.body.removeChild(container);
  });

  it('renders nothing when closed', () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<ImportHistoryPanel isOpen={false} onClose={onClose} importedFiles={[]} />);
    });
    // when closed, the panel returns null, so container should be empty
    expect(container.textContent).toBe('');
    root.unmount();
    document.body.removeChild(container);
  });
});
