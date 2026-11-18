import { lazy, type ComponentType } from 'react';

/**
 * A page loaded only when it is first opened (task 5.3): each page is its
 * own file in the build, so signing in does not download the whole app.
 * Pages are named exports; this picks the one asked for.
 */
export function lazyPage<M extends Record<string, unknown>>(
  load: () => Promise<M>,
  name: keyof M & string,
) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}
