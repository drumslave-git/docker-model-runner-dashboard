import { createDmrApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const app = createDmrApp();

app.listen(port, () => {
  console.log(`DMR dashboard server listening on http://localhost:${port}`);
});
