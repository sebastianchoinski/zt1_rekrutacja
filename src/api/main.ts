import 'dotenv/config';
import { createApplication } from './app.js';

let app: Awaited<ReturnType<typeof createApplication>> | undefined;
try {
  const port = Number(process.env.PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT musi być liczbą całkowitą od 1 do 65535.');
  app = await createApplication();
  await app.listen(port, process.env.HOST ?? '127.0.0.1');
  console.log(`API: http://localhost:${port}`);
} catch (error) {
  await app?.close();
  console.error('Nie udało się uruchomić API.');
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
}
