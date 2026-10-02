import { initializeFaro } from '@grafana/faro-core';
import type { EventEvent, TransportItem } from '@grafana/faro-core';
import { mockConfig, MockTransport } from '@grafana/faro-core/src/testUtils';

import { NavigationInstrumentation } from './instrumentation';

type NavigationEntry = Partial<PerformanceNavigationTiming> & { activationStart?: number };

describe('NavigationInstrumentation hard page load', () => {
  const originalPerformanceObserver = (global as any).PerformanceObserver;
  const originalPrerendering = Object.getOwnPropertyDescriptor(document, 'prerendering');
  const originalReferrer = Object.getOwnPropertyDescriptor(document, 'referrer');

  let observerCallback: PerformanceObserverCallback | undefined;
  let observeOptions: PerformanceObserverInit | undefined;
  let disconnect: jest.Mock;
  let transport: MockTransport;

  class MockPerformanceObserver {
    constructor(cb: PerformanceObserverCallback) {
      observerCallback = cb;
    }

    observe(options: PerformanceObserverInit) {
      observeOptions = options;
    }

    disconnect = disconnect;
  }

  function deliver(entries: NavigationEntry[]) {
    observerCallback!(
      { getEntries: () => entries } as unknown as PerformanceObserverEntryList,
      {} as PerformanceObserver
    );
  }

  function setup() {
    transport = new MockTransport();
    initializeFaro(mockConfig({ transports: [transport], instrumentations: [new NavigationInstrumentation()] }));
  }

  function navigationEvents() {
    return (transport.items as Array<TransportItem<EventEvent>>)
      .map((item) => item.payload)
      .filter((payload) => payload.name === 'faro.navigation');
  }

  beforeEach(() => {
    observerCallback = undefined;
    observeOptions = undefined;
    disconnect = jest.fn();
    (global as any).PerformanceObserver = MockPerformanceObserver;
  });

  afterEach(() => {
    if (originalPerformanceObserver) {
      (global as any).PerformanceObserver = originalPerformanceObserver;
    } else {
      delete (global as any).PerformanceObserver;
    }

    if (originalPrerendering) {
      Object.defineProperty(document, 'prerendering', originalPrerendering);
    } else {
      delete (document as any).prerendering;
    }

    if (originalReferrer) {
      Object.defineProperty(document, 'referrer', originalReferrer);
    } else {
      delete (document as any).referrer;
    }
  });

  it('emits one navigation event for the document load', () => {
    Object.defineProperty(document, 'referrer', { configurable: true, get: () => 'https://example.com/from' });

    setup();

    expect(observeOptions).toEqual({ type: 'navigation', buffered: true });

    deliver([{ name: 'https://example.com/to', duration: 1234.5 }]);

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(navigationEvents()).toEqual([
      expect.objectContaining({
        name: 'faro.navigation',
        attributes: {
          fromUrl: 'https://example.com/from',
          toUrl: 'https://example.com/to',
          sameDocument: 'false',
          duration: '1234.5',
        },
      }),
    ]);
  });

  it('sends an empty fromUrl when there is no referrer', () => {
    Object.defineProperty(document, 'referrer', { configurable: true, get: () => '' });

    setup();
    deliver([{ name: 'https://example.com/to', duration: 100 }]);

    expect(navigationEvents()[0]?.attributes).toEqual({
      fromUrl: '',
      toUrl: 'https://example.com/to',
      sameDocument: 'false',
      duration: '100',
    });
  });

  it('does not emit when the observer delivers no entry', () => {
    setup();
    deliver([]);

    expect(disconnect).not.toHaveBeenCalled();
    expect(navigationEvents()).toHaveLength(0);
  });

  it('waits for activation on prerendered pages and measures from activationStart', () => {
    let prerendering = true;
    Object.defineProperty(document, 'prerendering', { configurable: true, get: () => prerendering });

    setup();

    expect(observerCallback).toBeUndefined();

    prerendering = false;
    document.dispatchEvent(new Event('prerenderingchange'));

    expect(observeOptions).toEqual({ type: 'navigation', buffered: true });

    deliver([{ name: 'https://example.com/to', duration: 900, activationStart: 600 }]);

    expect(navigationEvents()[0]?.attributes?.['duration']).toBe('300');
  });

  it('clamps the duration to zero when activation happened after load', () => {
    setup();
    deliver([{ name: 'https://example.com/to', duration: 500, activationStart: 2000 }]);

    expect(navigationEvents()[0]?.attributes?.['duration']).toBe('0');
  });

  it('does nothing when PerformanceObserver is not available', () => {
    delete (global as any).PerformanceObserver;
    delete (window as any).PerformanceObserver;

    expect(() => setup()).not.toThrow();
    expect(navigationEvents()).toHaveLength(0);
  });
});
