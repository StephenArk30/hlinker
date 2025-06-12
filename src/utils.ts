import rl from 'readline';
import fs from 'fs';
import { hardLinkDir as pnpmHardLinkDir } from '@pnpm/fs.hard-link-dir';
import chalk from 'chalk';
import path from 'path';

declare const __VERSION__: string;

export const readFile = (filePath: string) => fs.readFileSync(filePath, 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readJSON = <T = any>(filePath: string) => {
  const fileContent = readFile(filePath);
  const spaces = fileContent.match(/^\s+/m)?.[0]?.length || 2;
  return [JSON.parse(fileContent) as T, spaces] as [T, number];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const writeJSON = <T = any>(filePath: string, data: T, space = 2) => fs.writeFileSync(filePath, JSON.stringify(data, null, space));

// text utils
export const pathText = chalk.underline;
export const notImportant = chalk.dim;
export const commandText = chalk.green;
export const warnText = chalk.yellow;

let alwaysYes = false;
export function setAlwaysYes(yes: boolean) {
  alwaysYes = yes;
}
export function confirm(message: string) {
  if (alwaysYes) {
    return Promise.resolve(true);
  }

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

function filterParams(args: string[], names: string[], paramLen: number, defaultValue: string[]): string[];
function filterParams(args: string[], names: string[], paramLen?: number): string[] | false;
function filterParams(args: string[], names: string[], paramLen = 0, defaultValue?: string[]) {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index > -1) {
      const params = args.slice(index + 1, index + 1 + paramLen);
      args.splice(index, paramLen + 1); // filter arg
      return params;
    }
  }
  return defaultValue || false;
}

export function showUsageAndExit() {
  console.log('Usage:');
  console.log('  hlinker link <package> <local-path>:<output-dir> [--save] [--project <project-path>]');
  console.log('  hlinker unlink <package> <output-dir> [--save] [--project <project-path>]');
  process.exit(1);
}

function extractArgsFn(args: string[]) {
  const hasSaveFlag = !!filterParams(args, ['-S', '--save']);
  const [projectRoot] = filterParams(args, ['-P', '--project'], 1, [path.resolve()]);

  const hasVersionFlag = !!filterParams(args, ['-v', '--version']);
  if (hasVersionFlag) {
    console.log(__VERSION__);
    process.exit(0);
  }
  const hasHelpFlag = !!filterParams(args, ['-h', '--help']);
  if (hasHelpFlag) {
    showUsageAndExit();
  }

  setAlwaysYes(!!filterParams(args, ['-y', '--yes']));

  const hasDryRunFlag = !!filterParams(args, ['--dry-run']);

  return {
    hasSaveFlag,
    projectRoot: path.resolve(projectRoot),
    hasDryRunFlag,
  }
}

export let context: ReturnType<typeof extractArgsFn> = {
  hasSaveFlag: false,
  projectRoot: path.resolve(),
  hasDryRunFlag: false,
};

export function extractArgs(args: string[]) {
  context = extractArgsFn(args);
  return context;
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

    if (!context.hasDryRunFlag) {
      existsDirs.forEach(dir => fs.rmSync(dir, {recursive: true}));
    }
  } else if (existsDirs.length > 0) {
    throw new HLinkExistError('destination directory already exists', existsDirs);
  }
  destDirs.forEach(dest => console.log(commandText('ln'), pathText(src), pathText(dest)));
  if (!context.hasDryRunFlag) {
    await pnpmHardLinkDir(src, destDirs);
  }
}

export function parsePackageName(packageName: string): { name: string; version?: string } {
  // @scope/package@version
  if (packageName.startsWith('@')) {
    const versionSeparatorIndex = packageName.lastIndexOf('@');
    const slashIndex = packageName.indexOf('/');

    // scope package with version
    if (versionSeparatorIndex > slashIndex) {
      return {
        name: packageName.substring(0, versionSeparatorIndex),
        version: packageName.substring(versionSeparatorIndex + 1),
      };
    }
    return { name: packageName };
  }

  // package@version
  const versionSeparatorIndex = packageName.lastIndexOf('@');
  if (versionSeparatorIndex > 0) {
    return {
      name: packageName.substring(0, versionSeparatorIndex),
      version: packageName.substring(versionSeparatorIndex + 1),
    };
  }

  return { name: packageName };
}
