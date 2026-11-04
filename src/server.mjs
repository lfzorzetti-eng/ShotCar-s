import { app } from './app.mjs';

await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' });
