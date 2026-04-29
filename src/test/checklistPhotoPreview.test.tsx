import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChecklistPhotoPreview } from '@/components/checklists/ChecklistPhotoPreview';

afterEach(() => cleanup());

/**
 * Protective tests: ensure checklist photos remain clickable for both
 * newly uploaded and archived photos. Do not remove.
 */
describe('ChecklistPhotoPreview', () => {
  it('opens the full-screen viewer when a newly uploaded photo is clicked', () => {
    render(<ChecklistPhotoPreview imageUrl="blob:new-photo" altText="new" />);
    const trigger = screen.getByRole('button', { name: /open checklist photo/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /back to checklist/i })).toBeTruthy();
  });

  it('opens the full-screen viewer when an archived photo is clicked', () => {
    render(<ChecklistPhotoPreview imageUrl="https://example.com/archived.jpg" altText="archived" />);
    const trigger = screen.getByRole('button', { name: /open checklist photo/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});