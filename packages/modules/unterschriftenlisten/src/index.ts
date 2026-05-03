import type { Module } from '@sam/core';

const unterschriftenlisten: Module = {
  name: 'unterschriftenlisten',
  displayName: 'Unterschriftenlisten',
  version: '0.0.0',
  // migrationsDir: new URL('../migrations/', import.meta.url).pathname,
  register(app, _ctx) {
    app.get('/api/unterschriftenlisten/_status', (_req, res) =>
      res.json({ module: 'unterschriftenlisten', status: 'stub' }),
    );
  },
};

export default unterschriftenlisten;
