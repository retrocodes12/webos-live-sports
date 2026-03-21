import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const webosDir = path.join(projectRoot, 'webos');
const outputDir = path.join(projectRoot, 'dist-webos');

if (!existsSync(distDir)) {
  throw new Error('Build output not found. Run "npm run build" first.');
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(distDir, outputDir, { recursive: true });
cpSync(path.join(webosDir, 'appinfo.json'), path.join(outputDir, 'appinfo.json'));

const iconSource = path.join(webosDir, 'icon.png');
if (existsSync(iconSource)) {
  cpSync(iconSource, path.join(outputDir, 'icon.png'));
}

console.log(`Prepared webOS package directory at ${outputDir}`);
