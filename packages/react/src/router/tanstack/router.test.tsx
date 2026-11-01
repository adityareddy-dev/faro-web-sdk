/** @jest-environment ./packages/react/jsdom-fetch.env.js */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';

import type { API } from '@grafana/faro-web-sdk';

import { ReactIntegration } from '../../instrumentation';

import { createTanStackRouterOptions } from './initialize';

function createTestRouter(initialEntry = '/', slowLoader?: () => Promise<void>) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => <div>Home</div> });
  const posts = createRoute({ getParentRoute: () => root, path: 'posts', component: Outlet });
  const post = createRoute({
    getParentRoute: () => posts,
    path: '$postId',
    validateSearch: (search: Record<string, unknown>): { page?: number } =>
      typeof search['page'] === 'number' ? { page: search['page'] } : {},
    component: () => <div>Post</div>,
  });
  const old = createRoute({
    getParentRoute: () => root,
    path: 'old',
    beforeLoad: () => {
      throw redirect({ to: '/posts/$postId', params: { postId: '42' } });
    },
  });
  const slow = createRoute({
    getParentRoute: () => root,
    path: 'slow',
    loader: slowLoader,
    component: () => <div>Slow</div>,
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({
    routeTree: root.addChildren([home, posts.addChildren([post]), old, slow]),
    history,
    isServer: false,
  });

  return { router, history };
}

describe('TanStack Router v1 (real router)', () => {
  let integration: ReactIntegration;
  let pushEvent: jest.Mock;
  let setView: jest.Mock;

  beforeEach(() => {
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    pushEvent = jest.fn();
    setView = jest.fn();
  });

  afterEach(() => {
    integration?.destroy();
    cleanup();
    jest.restoreAllMocks();
  });

  async function start(initialEntry = '/', slowLoader?: () => Promise<void>) {
    const fixture = createTestRouter(initialEntry, slowLoader);
    integration = new ReactIntegration({ router: createTanStackRouterOptions({ router: fixture.router }) });
    integration.api = { pushEvent, setView } as unknown as API;
    integration.initialize();
    render(<RouterProvider router={fixture.router} />);
    await waitFor(() => expect(pushEvent).toHaveBeenCalledTimes(1));
    return fixture;
  }

  it('reports initial load, nested parameter patterns and previous locations', async () => {
    const { router } = await start();
    await act(() => router.navigate({ to: '/posts/$postId', params: { postId: '42' } }));
    expect(pushEvent).toHaveBeenLastCalledWith('route_change', {
      fromRoute: '/',
      fromUrl: 'http://localhost/',
      toRoute: '/posts/$postId',
      toUrl: 'http://localhost/posts/42',
    });
    expect(setView).toHaveBeenLastCalledWith({ name: '/posts/$postId' });
  });

  it('reports back and forward navigation', async () => {
    const { router, history } = await start();
    await act(() => router.navigate({ to: '/posts/$postId', params: { postId: '42' } }));
    await act(async () => {
      history.back();
    });
    await waitFor(() => expect(pushEvent).toHaveBeenCalledTimes(3));
    expect(pushEvent.mock.calls[2]?.[1].toRoute).toBe('/');
    await act(async () => {
      history.forward();
    });
    await waitFor(() => expect(pushEvent).toHaveBeenCalledTimes(4));
    expect(pushEvent.mock.calls[3]?.[1].toRoute).toBe('/posts/$postId');
  });

  it('reports replace navigations and keeps the replaced route as the next source', async () => {
    const { router } = await start();
    await act(() => router.navigate({ to: '/posts/$postId', params: { postId: '1' }, replace: true }));
    await act(() => router.navigate({ to: '/posts/$postId', params: { postId: '2' } }));
    expect(pushEvent).toHaveBeenCalledTimes(3);
    expect(pushEvent.mock.calls[2]?.[1].fromUrl).toBe('http://localhost/posts/1');
  });

  it('reports search and hash changes without treating revalidation as navigation', async () => {
    const { router } = await start('/posts/42');
    await act(() => router.navigate({ to: '/posts/$postId', params: { postId: '42' }, search: { page: 2 } }));
    await act(() =>
      router.navigate({ to: '/posts/$postId', params: { postId: '42' }, search: true, hash: 'comments' })
    );
    expect(pushEvent).toHaveBeenCalledTimes(3);
    await act(() => router.invalidate());
    expect(pushEvent).toHaveBeenCalledTimes(3);
  });

  it('does not report preloads and only reports the final redirect destination', async () => {
    const { router } = await start();
    await act(() => router.preloadRoute({ to: '/posts/$postId', params: { postId: '99' } }));
    expect(pushEvent).toHaveBeenCalledTimes(1);
    await act(() => router.navigate({ to: '/old' }));
    expect(pushEvent).toHaveBeenCalledTimes(2);
    expect(pushEvent.mock.calls[1]?.[1].toRoute).toBe('/posts/$postId');
    expect(pushEvent.mock.calls[1]?.[1].toUrl).toBe('http://localhost/posts/42');
  });

  it('waits for a loader to resolve before reporting the route', async () => {
    let finish!: () => void;
    const loading = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { router } = await start('/', () => loading);
    let navigation!: Promise<void>;
    await act(async () => {
      navigation = router.navigate({ to: '/slow' });
    });
    expect(pushEvent).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await navigation;
    });
    await waitFor(() => expect(pushEvent).toHaveBeenCalledTimes(2));
    expect(pushEvent.mock.calls[1]?.[1].toRoute).toBe('/slow');
  });

  it('stops reporting after destroy and does not duplicate subscriptions on initialize', async () => {
    const { router } = await start();
    integration.initialize();
    pushEvent.mockClear();
    await act(() => router.navigate({ to: '/posts/$postId', params: { postId: '1' } }));
    expect(pushEvent).toHaveBeenCalledTimes(1);
    integration.destroy();
    await act(() => router.navigate({ to: '/posts/$postId', params: { postId: '2' } }));
    expect(pushEvent).toHaveBeenCalledTimes(1);
  });
});
