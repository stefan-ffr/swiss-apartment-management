import type { Module } from '@sam/core';

const wohnungen: Module = {
  name: 'wohnungen',
  displayName: 'Apartments & Residents',
  version: '0.0.0',
  permissions: [
    { key: 'wohnungen', label: 'Apartments management', scopes: ['read', 'write'] },
  ],
  migrationsDir: new URL('../migrations/', import.meta.url).pathname,
  register(app, _ctx) {
    app.get('/api/wohnungen/_status', (_req, res) =>
      res.json({ module: 'wohnungen', status: 'stub' }),
    );
  },
};

export default wohnungen;
