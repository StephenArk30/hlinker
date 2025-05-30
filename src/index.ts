import { linkPackage, unlinkPackage } from './pnpm';
import fs from 'fs';
import { confirm, readFile, readJSON, writeJSON } from './utils';

declare const __VERSION__: string;

// check if .hlinker.json is in .gitignore
async function checkGitIgnore() {
  if (fs.existsSync('.gitignore')) {
    const gitignoreContent = readFile('.gitignore');
    if (!gitignoreContent.includes('.hlinker.json')) {
      const addToGitignore = await confirm('Do you want to add .hlinker.json to .gitignore?');
      if (addToGitignore) {
        fs.appendFileSync('.gitignore', '\n.hlinker.json');
      }
    }
  }
}

// check if package.json exists and add postinstall hook
async function checkPostInstall() {
  if (fs.existsSync('package.json')) {
    const packageJson = readJSON('package.json');
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }
    if (!packageJson.scripts.postinstall) {
      const addPostinstall = await confirm(`Do you want to add "npx hlinker@${__VERSION__} link" to postinstall hook in package.json?`);
      if (addPostinstall) {
        packageJson.scripts.postinstall = `npx hlinker@${__VERSION__} link`;
        writeJSON('package.json', packageJson);
      }
    } else {
      console.error(`postinstall hook already exists in package.json. Please manually add "&& npx hlinker@${__VERSION__} link" to the existing command.`);
    }
  }
}

function showUsageAndExit() {
  console.error('Usage:');
  console.error('  hlinker link <package> <local-path>:<output-dir> [--save]');
  console.error('  hlinker unlink <package> <output-dir> [--save]');
  process.exit(1);
}

async function link(packageName: string | undefined, pathSpec: string | undefined, hasSaveFlag: boolean) {
  if (!pathSpec) {
    // read from .hlinker.json
    const config = readJSON('.hlinker.json');
    // 1. read and link all
    if (!packageName) {
      await Promise.all(Object.keys(config).map((pkgName) => {
        return link(pkgName, config[pkgName], hasSaveFlag);
      }));
      return;
    }
    // 2. read and link one
    const savedPath = config[packageName];
    if (!savedPath) {
      throw new Error(`No saved path found for package: ${packageName}`);
    }
    await link(packageName, savedPath, hasSaveFlag);
    return;
  }
  if (!packageName) {
    showUsageAndExit();
    return;
  }
  // 3. link one
  const [localPath, outputDir = 'dist'] = pathSpec.split(':');
  await linkPackage(packageName, localPath, outputDir);
  if (hasSaveFlag) {
    // save to .hlinker.json
    if (!fs.existsSync('.hlinker.json')){
      if (!(await confirm('No .hlinker.json found. Do you want to create one?'))) {
        return;
      }
    }
    const config = fs.existsSync('.hlinker.json') ? readJSON('.hlinker.json') : {};
    config[packageName] = pathSpec;
    writeJSON('.hlinker.json', config);

    await checkGitIgnore();
    await checkPostInstall();
  }
}

async function unlink(packageName: string | undefined, outputDir: string | undefined, hasSaveFlag: boolean) {
  if (!outputDir) {
    // read from .hlinker.json
    const config = readJSON('.hlinker.json');
    // 1. read and unlink all
    if (!packageName) {
      await Promise.all(Object.keys(config).map((pkgName) => {
        const outDir = config[pkgName].split(':')[1] || 'dist';
        return unlink(pkgName, outDir, hasSaveFlag);
      }));
      return;
    }
    // 2. read and unlink one
    const savedPath = config[packageName]?.split(':')[1];
    if (!savedPath) {
      throw new Error(`No saved path found for package: ${packageName}`);
    }
    await unlink(packageName, savedPath, hasSaveFlag);
    return;
  }
  if (!packageName) {
    showUsageAndExit();
    return;
  }
  // 3. unlink one
  await unlinkPackage(packageName, outputDir);
  if (hasSaveFlag) {
    // remove from .hlinker.json
    if (fs.existsSync('.hlinker.json')) {
      const config = readJSON('.hlinker.json');
      delete config[packageName];
      writeJSON('.hlinker.json', config);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const saveFlagIndex = args.indexOf('--save');
  const hasSaveFlag = saveFlagIndex !== -1;
  const filteredArgs = hasSaveFlag ? args.filter((_, i) => i !== saveFlagIndex) : args;
  const [action, packageName, pathSpec] = filteredArgs;

  switch (action) {
  case 'link':
    await link(packageName, pathSpec, hasSaveFlag);
    break;
  case 'unlink':
    await unlink(packageName, pathSpec, hasSaveFlag);
    break;
  case 'relink':
    await unlink(packageName, pathSpec, hasSaveFlag);
    await link(packageName, pathSpec, hasSaveFlag);
    break;
  default:
    showUsageAndExit();
  }
}

main();
