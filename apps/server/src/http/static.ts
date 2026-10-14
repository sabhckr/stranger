import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/**
 * Optional single-service mode: serve the built SPA (`apps/web/dist`) from the API process with
 * an SPA fallback, so one container/host serves the site, the API and the WebSocket on one origin.
 */
export async function registerStatic(app: FastifyInstance, dir: string): Promise<string> {
  const root = path.resolve(dir);
  const indexPath = path.join(root, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `STATIC_DIR ${root} has no index.html — build the web app first (npm run build)`,
    );
  }
  const index = fs.readFileSync(indexPath);

  await app.register(fastifyStatic, {
    root,
    wildcard: false,
    index: false,
    setHeaders(reply, filePath) {
      const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
      reply.header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });

  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0] ?? '/';
    const isApi =
      url.startsWith('/api') || url === '/ws' || url === '/healthz' || url === '/readyz';
    if ((req.method !== 'GET' && req.method !== 'HEAD') || isApi || path.extname(url)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(index);
  });
  return root;
}
