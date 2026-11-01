export interface TanStackRouterLocation {
  href: string;
  publicHref?: string;
  pathname: string;
}

// Only the public router APIs used by the integration are required.
export interface TanStackRouter {
  isServer?: boolean;
  state: {
    status: string;
    location: TanStackRouterLocation;
    matches: Array<{ routeId: string }>;
  };
  routesById: Record<string, { fullPath: string }>;
  subscribe(event: 'onResolved', listener: (event: { toLocation: TanStackRouterLocation }) => void): () => void;
}

export interface TanStackRouterDependencies {
  router: TanStackRouter;
}
