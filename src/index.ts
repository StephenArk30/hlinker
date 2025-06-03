import { linkPackage, unlinkPackage } from './pnpm';
import fs from 'fs';
import path from 'path';
import { confirm, HLinkExistError, notImportant, readFile, readJSON, writeJSON } from './utils';
import chalk from 'chalk';

declare const __VERSION__: string;

const LOCAL_CONFIG_FILE = '.hlinker.json';

// check if .hlinker.json is in .gitignore
async function checkGitIgnore(project: string) {
  const gitIgnorePath = path.resolve(project, '.gitignore');
  if (fs.existsSync(gitIgnorePath)) {
    const gitignoreContent = readFile(gitIgnorePath);
    if (!gitignoreContent.includes(LOCAL_CONFIG_FILE)) {
      if (await confirm(`Do you want to add ${LOCAL_CONFIG_FILE} to .gitignore?`)) {
        fs.appendFileSync(gitIgnorePath, `\n${LOCAL_CONFIG_FILE}`);
      }
    }
  }
}

// check if package.json exists and add postinstall hook
async function checkPostInstall(project: string) {
  const pkgJsonPath = path.resolve(project, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const [packageJson, spaces] = readJSON(pkgJsonPath);
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }
    if (!packageJson.scripts.postinstall) {
      if (await confirm(`Do you want to add "npx hlinker@${__VERSION__} link" to postinstall hook in package.json?`)) {
        packageJson.scripts.postinstall = `npx hlinker@${__VERSION__} link`;
        writeJSON(pkgJsonPath, packageJson, spaces);
      }
    } else if (!packageJson.scripts.postinstall.includes('hlinker')) {
      console.log(chalk.yellow(`postinstall hook already exists in package.json. Please manually add "&& npx hlinker@${__VERSION__} link" to the existing command.`));
    }
  }
}

function showUsageAndExit() {
  console.log('Usage:');
  console.log('  hlinker link <package> <local-path>:<output-dir> [--save] [--project <project-path>]');
  console.log('  hlinker unlink <package> <output-dir> [--save] [--project <project-path>]');
  process.exit(1);
}

async function link(packageName: string | undefined, pathSpec: string | undefined, hasSaveFlag: boolean, projectRoot: string) {
  const configPath = path.resolve(projectRoot, LOCAL_CONFIG_FILE);

  if (!pathSpec) {
    // read from .hlinker.json
    const [config] = readJSON(configPath);
    // 1. read and link all
    if (!packageName) {
      await Promise.all(Object.keys(config).map((pkgName) => {
        return link(pkgName, config[pkgName], hasSaveFlag, projectRoot);
      }));
      return;
    }
    // 2. read and link one
    const savedPath = config[packageName];
    if (!savedPath) {
      throw new Error(`No saved path found for package: ${packageName}`);
    }
    await link(packageName, savedPath, hasSaveFlag, projectRoot);
    return;
  }
  if (!packageName) {
    showUsageAndExit();
    return;
  }
  // 3. link one
  const [localPath, outputDir = 'dist'] = pathSpec.split(':');

  try {
    await linkPackage(packageName, localPath, outputDir, projectRoot);
  } catch (e) {
    if (e instanceof HLinkExistError) {
      e.print();
      if (!(await confirm(`Link already exists for package: ${packageName}. Do you want to overwrite it?`))) {
        process.exit(0);
      }
      console.log(notImportant('Forcing link'));
      await linkPackage(packageName, localPath, outputDir, projectRoot, true);
    } else {
      throw e;
    }
  }

  if (hasSaveFlag) {
    // save to .hlinker.json
    if (!fs.existsSync(configPath)){
      if (!(await confirm(`No ${configPath} found. Do you want to create one?`))) {
        return;
      }
    }
    const config = fs.existsSync(configPath) ? readJSON(configPath)[0] : {};
    config[packageName] = pathSpec;
    writeJSON(configPath, config);

    await checkGitIgnore(projectRoot);
    await checkPostInstall(projectRoot);
  }
}

async function unlink(packageName: string | undefined, outputDir: string | undefined, hasSaveFlag: boolean, projectRoot: string) {
  const configPath = path.resolve(projectRoot, LOCAL_CONFIG_FILE);

  if (!outputDir) {
    // read from .hlinker.json
    const [config] = readJSON(configPath);
    // 1. read and unlink all
    if (!packageName) {
      await Promise.all(Object.keys(config).map((pkgName) => {
        const outDir = config[pkgName].split(':')[1] || 'dist';
        return unlink(pkgName, outDir, hasSaveFlag, projectRoot);
      }));
      return;
    }
    // 2. read and unlink one
    const savedPath = config[packageName]?.split(':')[1];
    if (!savedPath) {
      throw new Error(`No saved path found for package: ${packageName}`);
    }
    await unlink(packageName, savedPath, hasSaveFlag, projectRoot);
    return;
  }
  if (!packageName) {
    showUsageAndExit();
    return;
  }
  // 3. unlink one
  await unlinkPackage(packageName, outputDir, projectRoot);
  if (hasSaveFlag) {
    // remove from .hlinker.json
    if (fs.existsSync(configPath)) {
      const [config] = readJSON(configPath);
      delete config[packageName];
      writeJSON(configPath, config);
    }
  }
}

async function main() {
  let args = process.argv.slice(2);

  const saveFlagIndex = args.indexOf('--save');
  const hasSaveFlag = saveFlagIndex !== -1;
  args = args.filter((_, i) => i !== saveFlagIndex);

  const projectRootIndex = args.indexOf('-P');
  const projectRoot = projectRootIndex !== -1 ? args[projectRootIndex + 1] : path.resolve();
  if (!projectRoot) {
    showUsageAndExit();
  }
  args = args.filter((_, i) => i !== projectRootIndex && i !== projectRootIndex + 1);

  const [action, packageName, pathSpec] = args;

  switch (action) {
  case 'link':
    await link(packageName, pathSpec, hasSaveFlag, projectRoot);
    break;
  case 'unlink':
    await unlink(packageName, pathSpec, hasSaveFlag, projectRoot);
    break;
  case 'relink':
    await unlink(packageName, pathSpec, hasSaveFlag, projectRoot);
    await link(packageName, pathSpec, hasSaveFlag, projectRoot);
    break;
  default:
    showUsageAndExit();
  }
}

main();
