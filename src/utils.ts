import rl from 'readline';
import fs from 'fs';
import { hardLinkDir as pnpmhardLinkDir } from '@pnpm/fs.hard-link-dir';
import chalk from 'chalk';

export const readFile = (filePath: string) => fs.readFileSync(filePath, 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readJSON = <T = any>(filePath: string) => {
  const fileContent = readFile(filePath);
  const spaces = fileContent.match(/^\s+/m)?.[0]?.length || 2;
  return [JSON.parse(fileContent) as T, spaces] as [T, number];
}
export const writeJSON = (filePath: string, data: object, space = 2) => fs.writeFileSync(filePath, JSON.stringify(data, null, space));

// text utils
export const pathText = chalk.underline;
export const notImportant = chalk.dim;
export const commandText = chalk.green;

export function confirm(message: string) {
  const readline = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    const ask = () => {
      readline.question(`${chalk.bold(message)} ${chalk.cyan('(Y/n)')} `, (answer) => {
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

export class HLinkExistError extends Error {
  constructor(message: string, public readonly dirs: string[]) {
    super(message);
  }

  public print() {
    console.log(chalk.dim.yellow('\n(!) Path already exists:'));
    this.dirs.forEach(dir => console.log(chalk.dim.yellow(pathText(dir))));
  }
}

export async function hardLinkDir(src: string, destDirs: string[], force = false) {
  const existsDirs = destDirs.filter(dir => fs.existsSync(dir));
  if (force) {
    if (existsDirs.length > 0) {
      existsDirs.forEach(dir => console.log(commandText('rm'), '-rf', pathText(dir)));
    }
    existsDirs.forEach(dir => fs.rmSync(dir, { recursive: true }));
  } else if (existsDirs.length > 0) {
    throw new HLinkExistError('destination directory already exists', existsDirs);
  }
  destDirs.forEach(dest => console.log(commandText('ln'), pathText(src), pathText(dest)));
  await pnpmhardLinkDir(src, destDirs);
}
