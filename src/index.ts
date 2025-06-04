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

interface IHLinkConfig {
  packages?: {
    [key: string]: string;
  };
  projects?: {
    [key: string]: string[] | 'all';
  }
}

function showUsageAndExit() {
  console.log('Usage:');
  console.log('  hlinker link <package> <local-path>:<output-dir> [--save] [--project <project-path>]');
  console.log('  hlinker unlink <package> <output-dir> [--save] [--project <project-path>]');
  process.exit(1);
}

const linkedProject = new Set<string>();

const readConfig = (configPath: string) => {
  const config: IHLinkConfig = fs.existsSync(configPath) ? readJSON(configPath)[0] : {};
  const packages = config.packages || {};
  const projects = config.projects || {};
  return { packages, projects };
};

async function link(packageName: string | undefined, pathSpec: string | undefined, hasSaveFlag: boolean, projectRoot: string) {
  linkedProject.add(projectRoot);
  const configPath = path.resolve(projectRoot, LOCAL_CONFIG_FILE);

  // 1. read and link all
  if (!packageName) {
    const { packages, projects } = readConfig(configPath);
    await Promise.all(Object.keys(packages).map((pkgName) => {
      return link(pkgName, packages[pkgName], false, projectRoot);
    }));
    await Promise.all(Object.keys(projects).map(async (p) => {
      const projectPath = path.resolve(projectRoot, p);
      if (linkedProject.has(projectPath)) {
        return;
      }
      if (projects[p] === 'all') {
        await link(undefined, undefined, false, projectPath);
      } else {
        await Promise.all(projects[p].map((pkgName) => link(pkgName, packages[pkgName], false, projectPath)));
      }
    }));
    return;
  } else if (!pathSpec) {
    // 2. read and link one
    const {packages} = readConfig(configPath);
    const savedPath = packages[packageName];
    if (!savedPath) {
      throw new Error(`No saved path found for package: ${packageName}`);
    }
    await link(packageName, savedPath, false, projectRoot);
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

  // save to .hlinker.json
  if (hasSaveFlag) {
    if (!fs.existsSync(configPath)){
      if (!(await confirm(`No ${configPath} found. Do you want to create one?`))) {
        return;
      }
    }
    const { packages, ...config } = readConfig(configPath);
    packages[packageName] = pathSpec;

    writeJSON(configPath, { ...config, packages });

    await checkGitIgnore(projectRoot);
    await checkPostInstall(projectRoot);
  }
}

async function linkAndSaveProject(packageName: string | undefined, pathSpec: string | undefined, hasSaveFlag: boolean, projectRoot: string) {
  await link(packageName, pathSpec, hasSaveFlag, projectRoot);

  // save project config only to current project
  if (hasSaveFlag) {
    const configPath = path.resolve(LOCAL_CONFIG_FILE);
    if (path.relative(projectRoot, configPath).startsWith('..')) {
      if (!fs.existsSync(configPath)){
        if (!(await confirm(`No ${configPath} found. Do you want to create one?`))) {
          return;
        }
      }
      const { projects, ...config } = readConfig(configPath);
      if (packageName) {
        if (projects[projectRoot] !== 'all') {
          projects[projectRoot] = (projects[projectRoot] || []).concat([packageName]);
        }
      } else {
        projects[projectRoot] = 'all';
      }

      writeJSON(configPath, { ...config, projects });

      await checkGitIgnore('.');
      await checkPostInstall('.');
    }
  }
}

async function unlink(packageName: string | undefined, outputDir: string | undefined, hasSaveFlag: boolean, projectRoot: string) {
  const configPath = path.resolve(projectRoot, LOCAL_CONFIG_FILE);

  // 1. read and unlink all
  if (!packageName) {
    const { packages, projects } = readConfig(configPath);
    await Promise.all(Object.keys(packages).map((pkgName) => {
      const outDir = packages[pkgName].split(':')[1] || 'dist';
      return unlink(pkgName, outDir, false, projectRoot);
    }));
    await Promise.all(Object.keys(projects).map(async (p) => {
      const projectPath = path.resolve(projectRoot, p);
      if (linkedProject.has(projectPath)) {
        return;
      }
      if (projects[p] === 'all') {
        await unlink(undefined, undefined, false, projectPath);
      } else {
        await Promise.all(projects[p].map(async (pkgName) => {
          const outDir = packages[pkgName].split(':')[1] || 'dist';
          return unlink(pkgName, outDir, false, projectPath);
        }));
      }
    }));
    return;
  } else if (!outputDir) {
    // 2. read and unlink one
    const { packages } = readConfig(configPath);
    const savedPath = packages[packageName]?.split(':')[1];
    if (!savedPath) {
      throw new Error(`No saved path found for package: ${packageName}`);
    }
    await unlink(packageName, savedPath, hasSaveFlag, projectRoot);
    return;
  }
  // 3. unlink one
  await unlinkPackage(packageName, outputDir, projectRoot);
  if (hasSaveFlag) {
    // remove from .hlinker.json
    if (fs.existsSync(configPath)) {
      const { packages, ...config } = readConfig(configPath);
      if (packageName) {
        delete packages[packageName];
      }
      writeJSON(configPath, { ...config, packages });
    }
  }
}

async function unlinkAndSaveProject(packageName: string | undefined, outputDir: string | undefined, hasSaveFlag: boolean, projectRoot: string) {
  await unlink(packageName, outputDir, hasSaveFlag, projectRoot);

  // save project config only to current project
  if (hasSaveFlag) {
    const configPath = path.resolve(LOCAL_CONFIG_FILE);
    if (path.relative(projectRoot, configPath).startsWith('..')) {
      if (!fs.existsSync(configPath)){
        return;
      }
      const { projects, ...config } = readConfig(configPath);
      if (packageName) {
        if (projects[projectRoot] !== 'all') {
          const index = projects[projectRoot].indexOf(packageName);
          if (index > -1) {
            projects[projectRoot].splice(index, 1);
          }
        }
      } else {
        delete projects[projectRoot];
      }

      writeJSON(configPath, { ...config, projects });

      await checkGitIgnore('.');
      await checkPostInstall('.');
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
    await linkAndSaveProject(packageName, pathSpec, hasSaveFlag, projectRoot);
    break;
  case 'unlink':
    await unlinkAndSaveProject(packageName, pathSpec, hasSaveFlag, projectRoot);
    break;
  case 'relink':
    await unlinkAndSaveProject(packageName, pathSpec, hasSaveFlag, projectRoot);
    await linkAndSaveProject(packageName, pathSpec, hasSaveFlag, projectRoot);
    break;
  default:
    showUsageAndExit();
  }
}

main();
