import type { Module } from '@sam/core';

const waschkueche: Module = {
  name: 'waschkueche',
  displayName: 'Waschkueche',
  version: '0.0.0',
  // migrationsDir: new URL('../migrations/', import.meta.url).pathname,
  register(app, _ctx) {
    app.get('/api/waschkueche/_status', (_req, res) =>
      res.json({ module: 'waschkueche', status: 'stub' }),
    );
  },
};

export default waschkueche;
