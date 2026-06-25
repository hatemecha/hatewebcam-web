import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('templates');
const target = resolve('dist/templates');

if (existsSync(source)) {
  cpSync(source, target, { recursive: true });
}
