import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = process.env.GITHUB_REF_NAME || process.env.RELEASE_VERSION || `v${packageJson.version}`;
if (/^v\d+\.\d+\.\d+$/.test(version) && version.slice(1) !== packageJson.version) {
  throw new Error(`tag ${version} does not match package version ${packageJson.version}`);
}
const releaseDir = join(root, 'release');
await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
const archive = join(releaseDir, `flowpilot-${version}.tar.gz`);
await exec('tar', ['-czf', archive, '-C', root, 'dist', 'src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'LICENSE', 'SECURITY.md', 'CHANGELOG.md', 'docs/PRODUCT_SPEC.md', '.env.example', 'install.sh', 'install.ps1', 'Dockerfile', 'docker-compose.yml']);
const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(join(releaseDir, 'SHA256SUMS'), `${digest}  ${archive.split('/').pop()}\n`);
console.log(`Created ${archive}`);
