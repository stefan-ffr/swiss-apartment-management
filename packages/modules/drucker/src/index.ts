import type { Module } from '@sam/core';

const drucker: Module = {
  name: 'drucker',
  displayName: 'Drucker',
  version: '0.0.0',
  // migrationsDir: new URL('../migrations/', import.meta.url).pathname,
  register(app, _ctx) {
    app.get('/api/drucker/_status', (_req, res) =>
      res.json({ module: 'drucker', status: 'stub' }),
    );
  },
};

export default drucker;
