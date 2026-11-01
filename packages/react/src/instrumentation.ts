import { BaseInstrumentation, VERSION } from '@grafana/faro-web-sdk';

import { setDependencies } from './dependencies';
import { initializeReactRouterInstrumentation } from './router';
import type { ReactIntegrationConfig } from './types';

export class ReactIntegration extends BaseInstrumentation {
  name = '@grafana/faro-react';
  version: string = VERSION;
  private unsubscribeRouter?: () => void;

  constructor(private options: ReactIntegrationConfig = {}) {
    super();
  }

  initialize(): void {
    this.destroy();
    setDependencies(this.internalLogger, this.api);
    this.unsubscribeRouter = initializeReactRouterInstrumentation(this.options);
  }

  destroy(): void {
    this.unsubscribeRouter?.();
    this.unsubscribeRouter = undefined;
  }
}
