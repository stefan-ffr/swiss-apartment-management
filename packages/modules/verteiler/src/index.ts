import type { Module } from '@sam/core';

const verteiler: Module = {
  name: 'verteiler',
  displayName: 'Verteiler',
  version: '0.0.0',
  // migrationsDir: new URL('../migrations/', import.meta.url).pathname,
  register(app, _ctx) {
    app.get('/api/verteiler/_status', (_req, res) =>
      res.json({ module: 'verteiler', status: 'stub' }),
    );
  },
};

export default verteiler;
