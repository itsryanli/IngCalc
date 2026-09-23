import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TotalsList } from './TotalsList';
import { myr } from '../../core/units';

const rows = [
  { key: 'pasar', label: 'Pasar', count: 3, spentMYR: myr(30), share: 0.6666 },
  { key: 'tesco', label: 'Tesco', count: 1, spentMYR: myr(15), share: 0.3334 },
];

describe('TotalsList', () => {
  it('lists each group with its count, spend and share', () => {
    render(<TotalsList title="By location" keyHeading="Location" rows={rows} showShare />);
    expect(screen.getByRole('heading', { name: 'By location' })).toBeInTheDocument();
    const pasar = screen.getByRole('row', { name: /Pasar/ });
    expect(within(pasar).getAllByRole('cell').map((c) => c.textContent)).toEqual(['3', 'RM30.00', '67%']);
  });

  it('leaves the share column out unless asked', () => {
    render(<TotalsList title="By month" keyHeading="Month" rows={rows} />);
    expect(screen.queryByRole('columnheader', { name: 'Share' })).toBeNull();
    expect(within(screen.getByRole('row', { name: /Tesco/ })).getAllByRole('cell')).toHaveLength(2);
  });
});
