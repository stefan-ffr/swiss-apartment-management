import type { Module } from '@sam/core';

const verwaltung: Module = {
  name: 'verwaltung',
  displayName: 'Verwaltung',
  version: '0.0.0',
  // migrationsDir: new URL('../migrations/', import.meta.url).pathname,
  register(app, _ctx) {
    app.get('/api/verwaltung/_status', (_req, res) =>
      res.json({ module: 'verwaltung', status: 'stub' }),
    );
  },
};

export default verwaltung;
