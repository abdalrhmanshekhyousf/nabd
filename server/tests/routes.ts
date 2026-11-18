import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Router } from 'express';

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

export type ApiRoute = { method: string; path: string; prefix: string };

/** Every route the API serves: each router module, at the prefix app.ts mounts it on. */
export async function allRoutes(): Promise<ApiRoute[]> {
  const source = readFileSync(fileURLToPath(new URL('../src/app.ts', import.meta.url)), 'utf8');
  const imports = new Map(
    [...source.matchAll(/import \{ ([\w, ]+) \} from '(\.\/routes\/[\w.]+)';/g)].flatMap((m) =>
      m[1]!.split(',').map((name) => [name.trim(), m[2]!] as const),
    ),
  );
  const routes: ApiRoute[] = [];
  for (const [, prefix, name] of source.matchAll(/app\.use\('(\/api[^']*)', (\w+Router)\)/g)) {
    const module = (await import(
      `../src/${imports.get(name!)!.slice(2).replace('.js', '.ts')}`
    )) as Record<string, Router>;
    for (const layer of module[name!]!.stack as Layer[]) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method, path: `${prefix}${layer.route.path}`, prefix: prefix! });
      }
    }
  }
  return routes;
}
