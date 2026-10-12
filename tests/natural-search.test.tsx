// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NaturalSearch } from '../src/client/components/NaturalSearch';
import { DEFAULT_DRAFT } from '../src/shared/search';
import type { SearchInterpretation } from '../src/shared/types';

const interpretation: SearchInterpretation = {
  q: 'restaurant',
  address: '',
  radius: null,
  day: '3',
  time: '20:00',
  open: '',
  sort: '',
  ratingMin: '',
  reviewsMin: '',
  priceMax: '2',
  unsupported: ['calme', 'pour 4 personnes'],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NaturalSearch', () => {
  it('fills the form, shows what was understood and what was ignored', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: true, json: async () => interpretation }) as Response,
    );
    vi.stubGlobal('fetch', fetcher);
    const onApply = vi.fn();
    render(<NaturalSearch draft={{ ...DEFAULT_DRAFT, address: 'Paris' }} onApply={onApply} />);
    const input = screen.getByLabelText('Décrire ma recherche', { selector: 'input' });
    expect(input).toHaveAttribute('maxlength', '200');
    fireEvent.change(input, { target: { value: 'resto calme et pas cher pour 4 ce soir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const [draft, filters] = onApply.mock.calls[0];
    expect(draft).toMatchObject({ q: 'restaurant', address: 'Paris', day: '3', time: '20:00' });
    expect(filters.priceMax).toBe('2');
    expect(await screen.findByText('Ouvert le mercredi à 20:00')).toBeInTheDocument();
    expect(screen.getByText(/Non pris en charge, ignoré : calme, pour 4 personnes/)).toBeVisible();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/api/interpret-search');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      text: 'resto calme et pas cher pour 4 ce soir',
    });
  });
  it('shows the service message and leaves the form untouched on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            json: async () => ({ error: 'L’assistant de recherche est indisponible.' }),
          }) as Response,
      ),
    );
    const onApply = vi.fn();
    render(<NaturalSearch draft={DEFAULT_DRAFT} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Décrire ma recherche', { selector: 'input' }), {
      target: { value: 'dentiste' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('indisponible');
    expect(onApply).not.toHaveBeenCalled();
  });
});
