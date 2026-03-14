import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SRGExplorer } from '../components/SRGExplorer';
import { srgService } from '../services/srgService';

const settings = {
  traversal: { algorithm: 'bfs', maxDepth: 3 },
  display: { layout: 'force', repulsion: 25, linkDistance: 80, damping: 0.9, colorScheme: 'layer', showArrows: false, labelFontSize: 14, labelZoomIndependent: true }
};

describe('SRGExplorer input behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not run trace on each keystroke, only on Enter or Run', async () => {
    const traceSpy = vi.spyOn(srgService, 'trace').mockImplementation(() => new Map());

    render(<SRGExplorer isOpen={true} onClose={() => {}} settings={settings as any} onSettingsChange={() => {}} />);

    const input = screen.getByPlaceholderText(/Enter trace query/i) as HTMLInputElement;

    // Type into input - should NOT trigger trace
    fireEvent.change(input, { target: { value: 'alpha' } });
    fireEvent.change(input, { target: { value: 'alpha beta' } });
    expect(traceSpy).not.toHaveBeenCalled();

    // Press Enter - should run trace once with the committed query
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(traceSpy).toHaveBeenCalledTimes(1);
    expect(traceSpy).toHaveBeenCalledWith('alpha beta', settings.traversal);

    // Now change and click the run button
    fireEvent.change(input, { target: { value: 'gamma' } });
    const btn = screen.getByTitle(/Run Trace/i);
    fireEvent.click(btn as HTMLElement);
    expect(traceSpy).toHaveBeenCalled();
  });
});
