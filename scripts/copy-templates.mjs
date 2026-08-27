import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const staticDirs = ['templates', 'vendor', 'css'];

for (const dir of staticDirs) {
  const source = resolve(dir);
  const target = resolve('dist', dir);
  if (!existsSync(source)) continue;

  rmSync(target, { force: true, recursive: true });
  cpSync(source, target, { recursive: true });
}
