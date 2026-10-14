import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InterestsInput, parseInterestInput } from './InterestsInput.js';

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <div>
      <InterestsInput value={value} onChange={setValue} />
      <output data-testid="value">{value.join('|')}</output>
    </div>
  );
}

describe('parseInterestInput', () => {
  it('splits, normalises and rejects junk', () => {
    expect(parseInterestInput('Music, FILMS ,, retro gaming')).toEqual({
      accepted: ['music', 'films', 'retro gaming'],
      rejected: [],
    });
    expect(parseInterestInput('<script>')).toEqual({ accepted: [], rejected: ['<script>'] });
  });
});

describe('InterestsInput', () => {
  it('adds on Enter and comma, removes with the chip button and Backspace', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/interests/i);
    fireEvent.change(input, { target: { value: 'Music' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('value')).toHaveTextContent('music');
    fireEvent.change(input, { target: { value: 'films,' } });
    expect(screen.getByTestId('value')).toHaveTextContent('music|films');
    fireEvent.click(screen.getByRole('button', { name: 'Remove music' }));
    expect(screen.getByTestId('value')).toHaveTextContent('films');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.getByTestId('value')).toHaveTextContent('');
  });

  it('reports invalid entries accessibly', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/interests/i);
    fireEvent.change(input, { target: { value: '<b>' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not add/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
