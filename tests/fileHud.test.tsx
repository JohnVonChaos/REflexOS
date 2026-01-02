import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent } from '@testing-library/react';
import FileHud from '../src/components/FileHud';
import workspace from '../src/services/workspaceManager';

describe('FileHud', () => {
  beforeEach(async () => {
    // seed some files and staged changes
    await workspace.fsSave('reflex://notes/a.md', 'alpha');
    await workspace.fsSave('reflex://notes/b.md', 'beta');
    await (workspace.staging as any).writeFile('reflex://notes/b.md', 'beta-mod');
  });

  it('renders and shows recents and staged changes', async () => {
    render(<FileHud onClose={() => {}} />);
    // wait for elements to appear
    const recent = await screen.findByText('reflex://notes/a.md');
    expect(recent).toBeTruthy();
    const staged = await screen.findByText('reflex://notes/b.md');
    expect(staged).toBeTruthy();
  });

  it('can commit staged changes', async () => {
    render(<FileHud onClose={() => {}} />);
    const input = await screen.findByPlaceholderText('Commit message');
    fireEvent.change(input, { target: { value: 'Test commit' } });
    const commitBtn = await screen.findByText('Commit');
    fireEvent.click(commitBtn);
    // commit should appear in recent commits
    const commitMsg = await screen.findByText('Test commit');
    expect(commitMsg).toBeTruthy();
  });
});
