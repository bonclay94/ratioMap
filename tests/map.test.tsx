// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import GoogleMap from '../src/client/maps/GoogleMap';
import { DEFAULT_DRAFT, DEFAULT_FILTERS } from '../src/shared/search';
import type { PublicConfig } from '../src/shared/types';
import { place } from './fixtures';

vi.mock('../src/client/maps/loader', () => ({ loadGoogleMaps: async () => {} }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('map / result identity', () => {
  it('keeps markers keyed by place ID, reuses them after sorting, and removes filtered markers', async () => {
    const created: Marker[] = [];
    class Bounds {
      points: unknown[] = [];
      extend(p: unknown) {
        this.points.push(p);
        return this;
      }
      isEmpty() {
        return this.points.length === 0;
      }
    }
    class Marker {
      listeners: Record<string, () => void> = {};
      setMap = vi.fn();
      setIcon = vi.fn();
      setZIndex = vi.fn();
      setLabel = vi.fn();
      constructor(public options: Record<string, unknown>) {
        created.push(this);
      }
      addListener(name: string, callback: () => void) {
        this.listeners[name] = callback;
      }
    }
    const fitBounds = vi.fn();
    class Map {
      data = { forEach: vi.fn(), remove: vi.fn(), setStyle: vi.fn(), addGeoJson: vi.fn() };
      fitBounds = fitBounds;
      getZoom = () => 12;
      setZoom = vi.fn();
    }
    class Circle {
      setMap = vi.fn();
      getBounds = () => new Bounds().extend({ lat: 0, lng: 0 });
    }
    vi.stubGlobal('google', {
      maps: {
        Map,
        Marker,
        Circle,
        LatLngBounds: Bounds,
        SymbolPath: { CIRCLE: 0 },
        places: {},
        event: { clearInstanceListeners: vi.fn(), addListenerOnce: vi.fn(), trigger: vi.fn() },
      },
    });
    const config: PublicConfig = {
      mapsApiKey: 'test-key',
      mapsMapId: null,
      searchAvailable: true,
      adsenseClientId: null,
      adsenseSlotId: null,
      aiAvailable: false,
    };
    const search = {
      draft: { ...DEFAULT_DRAFT, q: 'café' },
      filters: DEFAULT_FILTERS,
      center: { lat: 48.8, lng: 2.3 },
    };
    const onSelect = vi.fn();
    const props = {
      config,
      search,
      activeId: null,
      onSelect,
      onHover: vi.fn(),
      onAddress: vi.fn(),
      visible: false,
    };
    const unlocated = { ...place, placeId: 'no-coordinates', lat: null, lng: null };
    const second = { ...place, placeId: 'second', name: 'Second' };
    const { rerender } = render(<GoogleMap {...props} places={[unlocated, second, place]} />);
    await waitFor(() => expect(created).toHaveLength(2));
    created[0].listeners.click();
    expect(onSelect).toHaveBeenCalledWith('second');
    const fitted = fitBounds.mock.calls.length;
    rerender(<GoogleMap {...props} places={[place, second, unlocated]} />);
    expect(created).toHaveLength(2);
    expect(created[0].setMap).not.toHaveBeenCalled();
    expect(fitBounds).toHaveBeenCalledTimes(fitted);
    rerender(<GoogleMap {...props} places={[place]} />);
    expect(created[0].setMap).toHaveBeenCalledWith(null);
    expect(created[1].setMap).not.toHaveBeenCalled();
  });
});
