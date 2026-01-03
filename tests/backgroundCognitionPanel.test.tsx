import React from 'react';
import { render, screen } from '@testing-library/react';
import 'fake-indexeddb/auto';
import BackgroundCognitionPanel from '../src/components/BackgroundCognitionPanel';
import { getDefaultSettings } from '../src/types';

describe('BackgroundCognitionPanel', () => {
  it('renders and shows workspace stats', async () => {
    const settings = getDefaultSettings();
    render(<BackgroundCognitionPanel isOpen={true} onClose={() => {}} settings={settings} setSettings={() => {}} isCognitionRunning={false} onRunCognitionNow={() => {}} />);
    expect(await screen.findByText(/Background Cognition & AI Workspace/i)).toBeTruthy();
    expect(await screen.findByText(/Workspace Mode/i)).toBeTruthy();
  });
});
