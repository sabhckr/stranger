import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConsentGate } from './ConsentGate.js';
import { getConsent } from '../lib/identity.js';

describe('ConsentGate', () => {
  beforeEach(() => window.localStorage.clear());

  it('requires both confirmations, then persists consent', () => {
    const onAccept = vi.fn();
    render(<ConsentGate onAccept={onAccept} />);
    const button = screen.getByRole('button', { name: /enter stranger/i });
    expect(button).toBeDisabled();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(screen.getByLabelText(/18 years of age/i));
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I agree to the/i));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onAccept).toHaveBeenCalledOnce();
    expect(getConsent()).toMatchObject({ ageConfirmed: true, termsAccepted: true });
  });
});
