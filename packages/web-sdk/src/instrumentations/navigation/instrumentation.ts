import { BaseInstrumentation, faro, Observable, VERSION } from '@grafana/faro-core';

import { ActivityWindowTracker, isRequestEndMessage, isRequestStartMessage } from '../_internal/activityWindowTracker';
import { monitorDomMutations } from '../_internal/monitors/domMutationMonitor';
import { monitorHttpRequests } from '../_internal/monitors/httpRequestMonitor';
import { monitorInteractions } from '../_internal/monitors/interactionMonitor';
import { monitorUrlChanges } from '../_internal/monitors/urlChangeMonitor';
import { performanceObserverSupported } from '../performance/performanceUtils';

export class NavigationInstrumentation extends BaseInstrumentation {
  readonly name = '@grafana/faro-web-sdk:instrumentation-navigation';
  readonly version: string = VERSION;

  override initialize(): void {
    const httpMonitor = monitorHttpRequests();
    const domMutationsMonitor = monitorDomMutations();
    const urlMonitor = monitorUrlChanges();
    const interactionMonitor = monitorInteractions(['pointerdown', 'keydown']);

    const activityWindowTracker = new ActivityWindowTracker(
      new Observable().merge(httpMonitor, domMutationsMonitor, urlMonitor),
      {
        inactivityMs: 100,
        drainTimeoutMs: 10 * 1000,
        isOperationStart: (msg) => (isRequestStartMessage(msg) ? msg.request.requestId : undefined),
        isOperationEnd: (msg) => (isRequestEndMessage(msg) ? msg.request.requestId : undefined),
      }
    );

    activityWindowTracker
      .filter((msg) => {
        return msg.message === 'tracking-ended';
      })
      .subscribe((msg) => {
        if (
          msg.events?.some((e: any) => e.type === 'url-change') &&
          msg.events?.some((e: any) => e.type === 'dom-mutation')
        ) {
          const urlChange = msg.events?.find((e: any) => e.type === 'url-change');
          faro.api.pushEvent('faro.navigation', {
            fromUrl: urlChange?.from,
            toUrl: urlChange?.to,
            sameDocument: String(true),
            duration: msg.duration,
          });
        }
      });

    interactionMonitor.subscribe(() => {
      activityWindowTracker.startTracking();
    });

    this.trackHardNavigation();
  }

  private trackHardNavigation(): void {
    if (!performanceObserverSupported()) {
      return;
    }

    const observeNavigationEntry = () => {
      const observer = new PerformanceObserver((list) => {
        const [entry] = list.getEntries() as Array<PerformanceNavigationTiming & { activationStart?: number }>;

        if (entry == null) {
          return;
        }

        observer.disconnect();

        // prerendered pages count from activation, the time the user actually saw the page
        const duration = Math.max(entry.duration - (entry.activationStart ?? 0), 0);

        faro.api.pushEvent('faro.navigation', {
          fromUrl: document.referrer,
          toUrl: entry.name,
          sameDocument: String(false),
          duration: String(duration),
        });
      });

      try {
        observer.observe({ type: 'navigation', buffered: true });
      } catch {
        this.logDebug('navigation entries not supported, hard page load navigation is not tracked');
      }
    };

    if ((document as Document & { prerendering?: boolean }).prerendering) {
      document.addEventListener('prerenderingchange', observeNavigationEntry, { once: true });
    } else {
      observeNavigationEntry();
    }
  }
}
