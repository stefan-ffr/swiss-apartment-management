import type { Module } from '@sam/core';

const energie: Module = {
  name: 'energie',
  displayName: 'Energie',
  version: '0.0.0',
  // migrationsDir: new URL('../migrations/', import.meta.url).pathname,
  register(app, _ctx) {
    app.get('/api/energie/_status', (_req, res) =>
      res.json({ module: 'energie', status: 'stub' }),
    );
  },
};

export default energie;
