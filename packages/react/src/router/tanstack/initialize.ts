import { EVENT_ROUTE_CHANGE, globalObject } from '@grafana/faro-web-sdk';
import type { API } from '@grafana/faro-web-sdk';

import type { TanStackRouterConfig } from '../../types';

import type { TanStackRouterDependencies, TanStackRouterLocation } from './types';

export function createTanStackRouterOptions(dependencies: TanStackRouterDependencies): TanStackRouterConfig {
  return { version: 'tanstack-v1', dependencies };
}

export function initializeTanStackRouterInstrumentation(
  { router }: TanStackRouterDependencies,
  api: API
): (() => void) | undefined {
  if (typeof window === 'undefined' || router.isServer) {
    return undefined;
  }

  let previous: { href: string; route: string; url: string } | undefined;

  const reportLocation = (location: TanStackRouterLocation): void => {
    if (previous?.href === location.href) {
      return;
    }

    const match = router.state.matches[router.state.matches.length - 1];
    const route = (match && router.routesById[match.routeId]?.fullPath) || location.pathname;
    const url = new URL(location.publicHref ?? location.href, globalObject.location?.href).href;
    const from = previous;
    previous = { href: location.href, route, url };

    api.setView({ name: route });
    api.pushEvent(EVENT_ROUTE_CHANGE, {
      toRoute: route,
      toUrl: url,
      ...(from ? { fromRoute: from.route, fromUrl: from.url } : {}),
    });
  };

  const unsubscribe = router.subscribe('onResolved', (event) => reportLocation(event.toLocation));

  // Faro may be initialized after the first route has already resolved.
  if (router.state.status === 'idle' && router.state.matches.length > 0) {
    reportLocation(router.state.location);
  }

  return unsubscribe;
}
