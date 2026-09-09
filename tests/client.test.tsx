// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useSearch } from '../src/client/useSearch';
import { TagInput } from '../src/client/components/TagInput';
import { Results } from '../src/client/components/Results';
import { PlaceDetail } from '../src/client/components/PlaceDetail';
import { App } from '../src/client/App';
import { DEFAULT_DRAFT, DEFAULT_FILTERS } from '../src/shared/search';
import { details, place, query } from './fixtures';

const response = { count: 1, places: [place], warnings: [], attributions: [] };
const json = (value: unknown) => Promise.resolve({ ok: true, json: async () => value } as Response);
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('client search lifecycle', () => {
  it('restores a shared URL without waiting for Maps or configuration', async () => {
    window.history.replaceState(null, '', `/?${new URLSearchParams(query)}`);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((url) =>
        String(url).includes('/api/config') ? new Promise(() => {}) : json(response),
      );
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(useSearch);
    await waitFor(() => expect(result.current.places).toHaveLength(1));
    expect(result.current.config).toBeNull();
    expect(result.current.executed?.draft.q).toBe('café');
  });
  it('aborts older searches and refuses stale responses even if the transport ignores cancellation', async () => {
    let resolveOld!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url) => {
      if (String(url).includes('/api/config'))
        return json({ mapsApiKey: null, searchAvailable: true });
      if (String(url).includes('/api/geocode')) return json({ lat: 48.8, lng: 2.3 });
      if (String(url).includes('q=old'))
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      return json(response);
    });
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(useSearch);
    act(() => result.current.submit({ ...DEFAULT_DRAFT, q: 'old', address: 'Paris' }));
    await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    act(() => result.current.submit({ ...DEFAULT_DRAFT, q: 'new', address: 'Lyon' }));
    await waitFor(() => expect(result.current.executed?.draft.q).toBe('new'));
    await act(async () => {
      resolveOld(await json({ ...response, places: [{ ...place, name: 'Obsolete' }] }));
    });
    expect(result.current.places[0].name).toBe(place.name);
    expect(window.location.search).toContain('q=new');
    const oldCall = fetcher.mock.calls.find(([url]) => String(url).includes('q=old'));
    expect(oldCall?.[1]?.signal?.aborted).toBe(true);
  });
  it('filters locally and shares the executed search, not edits waiting for submission', async () => {
    window.history.replaceState(null, '', `/?${new URLSearchParams(query)}`);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((url) =>
        String(url).includes('/api/config') ? json({ mapsApiKey: null }) : json(response),
      );
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(useSearch);
    await waitFor(() => expect(result.current.places).toHaveLength(1));
    const calls = fetcher.mock.calls.length;
    act(() => result.current.setDraft({ ...result.current.draft, q: 'dentiste' }));
    act(() => result.current.changeFilters({ ...DEFAULT_FILTERS, ratingMin: '4.8' }));
    expect(result.current.places).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(window.location.search).toContain('q=caf');
    expect(window.location.search).not.toContain('dentiste');
    expect(result.current.dirty).toBe(true);
  });
  it('restores browser navigation and clears state when returning home', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockImplementation((url) =>
          String(url).includes('/api/config') ? json({ mapsApiKey: null }) : json(response),
        ),
    );
    const { result } = renderHook(useSearch);
    act(() => {
      window.history.replaceState(null, '', `/?${new URLSearchParams(query)}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(result.current.places).toHaveLength(1));
    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.places).toHaveLength(0);
    expect(result.current.executed).toBeNull();
    expect(result.current.draft.q).toBe('');
  });
  it('retains previous results and surfaces a failed replacement search', async () => {
    window.history.replaceState(null, '', `/?${new URLSearchParams(query)}`);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((url) =>
        String(url).includes('/api/config') ? json({ mapsApiKey: null }) : json(response),
      );
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(useSearch);
    await waitFor(() => expect(result.current.places).toHaveLength(1));
    fetcher.mockRejectedValue(new Error('offline'));
    act(() => result.current.submit({ ...DEFAULT_DRAFT, q: 'another', address: 'Paris' }));
    await waitFor(() => expect(result.current.error).toContain('Connexion'));
    expect(result.current.places).toHaveLength(1);
    expect(result.current.phase).toBe('idle');
  });
});
describe('accessible controls and safe external content', () => {
  it('connects the complete search, local filters, details and full-link fallback', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url) => {
      const path = String(url);
      if (path.includes('/api/config')) return json({ mapsApiKey: null, searchAvailable: true });
      if (path.includes('/api/geocode')) return json({ lat: 48.8566, lng: 2.3522 });
      if (path.includes('/api/place-details')) return json(details);
      if (path.includes('/api/shorten'))
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Storage unavailable' }),
        } as Response);
      return json(response);
    });
    vi.stubGlobal('fetch', fetcher);
    render(<App />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Que cherchez-vous ?' }), {
      target: { value: 'Café' },
    });
    fireEvent.change(screen.getByLabelText('Autour de'), { target: { value: 'Paris' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByRole('button', { name: new RegExp(place.name) });
    fireEvent.click(screen.getByRole('button', { name: 'Réduire les résultats' }));
    expect(screen.queryByRole('button', { name: new RegExp(place.name) })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Autour de')).toHaveValue('Paris');
    fireEvent.click(screen.getByRole('button', { name: '1 résultat' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(place.name) }));
    expect(await screen.findByRole('dialog', { name: place.name })).toBeInTheDocument();
    expect(await screen.findByText(details.reviews[0].text)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    fireEvent.change(screen.getByLabelText('Note minimum'), { target: { value: '4.8' } });
    expect(screen.getByText('Aucun lieu ne correspond.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Partager cette recherche' }));
    expect(
      await screen.findByRole('dialog', { name: 'Partager cette recherche' }),
    ).toBeInTheDocument();
    expect((screen.getByLabelText('Lien de la recherche') as HTMLInputElement).value).toContain(
      'ratingMin=4.8',
    );
    expect(await screen.findByText(/Le lien court est indisponible/)).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/api/search'))).toHaveLength(
      1,
    );
  });
  it('selects the local department suggestion with a keyboard', () => {
    const onChange = vi.fn();
    render(<TagInput values={[]} onChange={onChange} location max={3} label="Zones" />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Essonne' } });
    expect(screen.getByRole('option', { name: 'Essonne (91)' })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['91']);
  });
  it('renders HTML-looking place names as text and keeps the correct place ID', () => {
    const onSelect = vi.fn();
    const name = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <Results
        places={[
          { ...place, name, lat: null, lng: null },
          { ...place, placeId: 'second' },
        ]}
        searched
        busy={false}
        hasUnfiltered
        selectedId={null}
        onSelect={onSelect}
        onHover={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(place.name) }));
    expect(onSelect).toHaveBeenCalledWith('second');
  });
  it('renders reviews as text, preserves author links, and aborts details on close', async () => {
    const text = '<svg onload=alert(1)>un avis</svg>';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => json({ ...details, reviews: [{ ...details.reviews[0], text }] }));
    vi.stubGlobal('fetch', fetcher);
    const { container, unmount } = render(<PlaceDetail place={place} onClose={() => {}} />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(container.querySelector('[onload]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Camille' })).toHaveAttribute(
      'href',
      details.reviews[0].authorUrl,
    );
    unmount();
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
