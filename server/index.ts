import { createDmrApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const dmrCliPath = process.env.DMR_CLI_PATH?.trim() || 'docker';
const app = createDmrApp();

app.listen(port, () => {
  console.log(`DMR dashboard server listening on http://localhost:${port}`);
  console.log(`Using Docker Model Runner CLI: ${dmrCliPath} model`);
});
