import rl from 'readline';
import fs from 'fs';
import { hardLinkDir as pnpmhardLinkDir } from '@pnpm/fs.hard-link-dir';

export function confirm(message: string) {
  const readline = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    const ask = () => {
      readline.question(`${message} (Y/n) `, (answer) => {
        const normalized = answer.trim().toLowerCase();
        if (normalized === 'y' || normalized === '') {
          readline.close();
          resolve(true);
        } else if (normalized === 'n') {
          readline.close();
          resolve(false);
        } else {
          ask();
        }
      });
    };
    ask();
  });
}

export const readFile = (filePath: string) => fs.readFileSync(filePath, 'utf8');
export const readJSON = (filePath: string) => JSON.parse(readFile(filePath));
export const writeJSON = (filePath: string, data: object) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

export class HLinkExistError extends Error {
  constructor(message: string, public readonly dirs: string[]) {
    super(message);
  }
}

export async function hardLinkDir(src: string, destDirs: string[], force = false) {
  const existsDirs = destDirs.filter(dir => fs.existsSync(dir));
  if (force) {
    existsDirs.forEach(dir => fs.rmSync(dir, { recursive: true }));
  } else if (existsDirs.length > 0) {
    throw new HLinkExistError('destination directory already exists', existsDirs);
  }
  await pnpmhardLinkDir(src, destDirs);
}
