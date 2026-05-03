import type { Module } from '@sam/core';

const telefonbuch: Module = {
  name: 'telefonbuch',
  displayName: 'Telefonbuch',
  version: '0.0.0',
  // migrationsDir: new URL('../migrations/', import.meta.url).pathname,
  register(app, _ctx) {
    app.get('/api/telefonbuch/_status', (_req, res) =>
      res.json({ module: 'telefonbuch', status: 'stub' }),
    );
  },
};

export default telefonbuch;
