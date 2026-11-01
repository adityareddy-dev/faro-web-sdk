import { api, internalLogger } from '../dependencies';
import type { ReactIntegrationConfig } from '../types';

import { initializeTanStackRouterInstrumentation } from './tanstack';
import { ReactRouterVersion } from './types';
import { initializeReactRouterV4V5Instrumentation } from './v4v5';
import { initializeReactRouterV6DataRouterInstrumentation, initializeReactRouterV6Instrumentation } from './v6v7';

export function initializeReactRouterInstrumentation(options: ReactIntegrationConfig): (() => void) | undefined {
  const initMessage = 'Initializing React Router';

  switch (options.router?.version) {
    case 'tanstack-v1':
      return initializeTanStackRouterInstrumentation(options.router.dependencies, api);

    case ReactRouterVersion.V7:
    case ReactRouterVersion.V6:
      internalLogger.debug(`${initMessage} ${options.router.version} instrumentation`);
      initializeReactRouterV6Instrumentation(options.router.dependencies);
      break;

    case ReactRouterVersion.V7_data_router:
    case ReactRouterVersion.V6_data_router:
      internalLogger.debug(`${initMessage} ${options.router.version} data router instrumentation`);
      initializeReactRouterV6DataRouterInstrumentation(options.router.dependencies);
      break;

    case ReactRouterVersion.V5:
    case ReactRouterVersion.V4:
      internalLogger.debug(`${initMessage} ${options.router.version} instrumentation`);
      initializeReactRouterV4V5Instrumentation(options.router.dependencies);
      break;

    default:
      internalLogger.debug('Skipping initialization of React Router instrumentation');
  }

  return undefined;
}
