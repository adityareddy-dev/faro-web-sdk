# @grafana/faro-react

Faro package that enables easier integration in projects built with React.

Out of the box, the package provides you the following features:

- Error Boundary - Provides additional stacktrace for errors and configuration options for
  pushError behavior
- Component Profiler - Capture every re-render of a component, the un/mounting time etc
- Router (v4–v7) integration - Send events for all route changes.

The Faro Web SDK is a highly configurable open source real user monitoring (RUM) library built on
OpenTelemetry and integrating seamlessly with Grafana Cloud and Grafana Frontend Observability.

Faro-React is a distribution of the Faro Web SDK for project using React, which offers easier
integrations and the following features:

- **Support for React Router v4–v7**: send events for all route changes, including the data
  router API
- **Support for TanStack Router v1**: set the view and send events when navigation resolves
- **Error boundary**: enhancements to stack traces and configuration options for pushError behavior
- **Component profiler**: to capture component renders, un/mounting time, and more.

## How to instrument with Faro React

For a complete guide to instrumenting web applications with the Faro-React Web SDK, refer to our
Grafana Cloud Frontend Observability [documentation](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro-react/).

## TanStack Router v1

Create the router before initializing Faro and pass it to `createTanStackRouterOptions`:

```tsx
import { createRouter, RouterProvider } from '@tanstack/react-router';
import {
  createTanStackRouterOptions,
  getWebInstrumentations,
  initializeFaro,
  ReactIntegration,
} from '@grafana/faro-react';

import { routeTree } from './routeTree.gen';

const router = createRouter({ routeTree });

initializeFaro({
  url: 'https://faro-collector.example.com/collect',
  app: { name: 'my-app' },
  instrumentations: [
    ...getWebInstrumentations(),
    new ReactIntegration({ router: createTanStackRouterOptions({ router }) }),
  ],
});

export function App() {
  return <RouterProvider router={router} />;
}
```

The integration subscribes to `onResolved`. It sets the view name to the matched route's full
pattern (for example, `/posts/$postId`) and emits `route_change` with `toRoute`, `toUrl` and,
after the first navigation, `fromRoute` and `fromUrl`. URLs include the search string and hash,
as in the React Router integrations. Unmatched locations fall back to the pathname.

The first resolved location is reported, including when Faro starts after the router has loaded.
Push, replace, back, forward, search and hash changes are reported when the URL changes.
Preloads, pending loads and repeated resolutions of the same URL do not emit navigation events.
Loader error reporting is outside this integration; the existing React error boundary remains
available for render errors.

The router is supplied by the application; this integration does not import TanStack Router at
runtime. Call `initializeFaro` only on the client in an SSR application, such as TanStack Start.
Server router instances are ignored. Removing the `ReactIntegration` through
`faro.instrumentations.remove(integration)` unsubscribes from the router.
