import { app } from '../src/app.mjs';

await app.ready();

export default function handler(req, res) {
  app.server.emit('request', req, res);
}
