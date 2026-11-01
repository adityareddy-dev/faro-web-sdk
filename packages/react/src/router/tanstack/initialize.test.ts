import type { API } from '@grafana/faro-web-sdk';

import { ReactIntegration } from '../../instrumentation';

import { createTanStackRouterOptions } from './initialize';
import type { TanStackRouter, TanStackRouterLocation } from './types';

describe('TanStack Router integration', () => {
  let router: TanStackRouter;
  let listener: (event: { toLocation: TanStackRouterLocation }) => void;
  let integration: ReactIntegration;
  let pushEvent: jest.Mock;
  let setView: jest.Mock;
  let unsubscribe: jest.Mock;

  const resolve = (href: string, routeId = 'post'): void => {
    const location = { href, pathname: href.split(/[?#]/)[0]! };
    router.state.location = location;
    router.state.matches = [{ routeId: '__root__' }, { routeId }];
    router.state.status = 'idle';
    listener({ toLocation: location });
  };

  beforeEach(() => {
    pushEvent = jest.fn();
    setView = jest.fn();
    unsubscribe = jest.fn();
    router = {
      state: { status: 'pending', location: { href: '/', pathname: '/' }, matches: [] },
      routesById: {
        __root__: { fullPath: '/' },
        post: { fullPath: '/posts/$postId' },
        layout: { fullPath: '/posts/$postId' },
        index: { fullPath: '/posts/' },
        splat: { fullPath: '/files/$' },
      },
      subscribe: jest.fn((_event, callback) => {
        listener = callback;
        return unsubscribe;
      }),
    };
    integration = new ReactIntegration({ router: createTanStackRouterOptions({ router }) });
    integration.api = { pushEvent, setView } as unknown as API;
  });

  afterEach(() => integration.destroy());

  it('reports the resolved route pattern as the view before its navigation event', () => {
    integration.initialize();
    resolve('/posts/42?sort=new#comments');

    expect(router.subscribe).toHaveBeenCalledWith('onResolved', expect.any(Function));
    expect(setView).toHaveBeenCalledWith({ name: '/posts/$postId' });
    expect(pushEvent).toHaveBeenCalledWith('route_change', {
      toRoute: '/posts/$postId',
      toUrl: 'http://localhost/posts/42?sort=new#comments',
    });
    expect(setView.mock.invocationCallOrder[0]).toBeLessThan(pushEvent.mock.invocationCallOrder[0]!);
  });

  it('retains the previous route and URL, including between parameter values', () => {
    integration.initialize();
    resolve('/posts/1');
    resolve('/posts/2');

    expect(pushEvent).toHaveBeenLastCalledWith('route_change', {
      fromRoute: '/posts/$postId',
      fromUrl: 'http://localhost/posts/1',
      toRoute: '/posts/$postId',
      toUrl: 'http://localhost/posts/2',
    });
  });

  it('does not report repeated resolutions of the same URL', () => {
    integration.initialize();
    resolve('/posts/1');
    resolve('/posts/1');
    expect(pushEvent).toHaveBeenCalledTimes(1);
  });

  it('reports search and hash changes once', () => {
    integration.initialize();
    resolve('/posts/1');
    resolve('/posts/1?sort=new');
    resolve('/posts/1?sort=new#comments');
    expect(pushEvent).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['layout', '/posts/42', '/posts/$postId'],
    ['index', '/posts/', '/posts/'],
    ['splat', '/files/a/b', '/files/$'],
    ['missing', '/not-found', '/not-found'],
  ])('resolves %s matches', (routeId, href, pattern) => {
    integration.initialize();
    resolve(href, routeId);
    expect(setView).toHaveBeenCalledWith({ name: pattern });
  });

  it('falls back to the pathname when there are no matches', () => {
    integration.initialize();
    listener({ toLocation: { href: '/missing?secret=1', pathname: '/missing' } });
    expect(setView).toHaveBeenCalledWith({ name: '/missing' });
  });

  it('reports an already resolved initial route once', () => {
    router.state = {
      status: 'idle',
      location: { href: '/posts/42', pathname: '/posts/42' },
      matches: [{ routeId: 'post' }],
    };
    integration.initialize();
    resolve('/posts/42');
    expect(pushEvent).toHaveBeenCalledTimes(1);
  });

  it('does not report pending routes at initialization', () => {
    router.state.matches = [{ routeId: 'post' }];
    integration.initialize();
    expect(pushEvent).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
  });

  it('uses the public URL for masked locations', () => {
    integration.initialize();
    router.state.matches = [{ routeId: 'post' }];
    listener({
      toLocation: { href: '/posts/42', pathname: '/posts/42', publicHref: '/p/42' },
    });
    expect(pushEvent).toHaveBeenCalledWith('route_change', {
      toRoute: '/posts/$postId',
      toUrl: 'http://localhost/p/42',
    });
  });

  it('skips server routers', () => {
    router.isServer = true;
    integration.initialize();
    expect(router.subscribe).not.toHaveBeenCalled();
    expect(pushEvent).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
  });

  it('unsubscribes on destroy and before reinitialization', () => {
    integration.initialize();
    integration.initialize();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    integration.destroy();
    integration.destroy();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});
