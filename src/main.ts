import { linkPackage, unlinkPackage } from './link';
import fs from 'fs';
import path from 'path';
import {
  confirm,
  HLinkExistError,
  notImportant,
  readFile,
  readJSON,
  writeJSON,
  showUsageAndExit,
  extractArgs, context,
} from './utils';
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

const linkedProject = new Set<string>();

const readConfig = (configPath: string) => {
  const config: IHLinkConfig = fs.existsSync(configPath) ? readJSON(configPath)[0] : {};
  const packages = config.packages || {};
  const projects = config.projects || {};
  return { packages, projects };
};

async function link(packageName: string | undefined, pathSpec: string | undefined, hasSaveFlag: boolean) {
  const { projectRoot } = context;

  linkedProject.add(projectRoot);
  const configPath = path.resolve(projectRoot, LOCAL_CONFIG_FILE);

  // 1. read and link all
  if (!packageName) {
    const { packages, projects } = readConfig(configPath);
    for (const pkgName in packages) {
      await link(pkgName, packages[pkgName], false);
    }
    for (const p in projects) {
      const projectPath = path.resolve(projectRoot, p);
      if (linkedProject.has(projectPath)) {
        return;
      }
      if (projects[p] === 'all') {
        await link(undefined, undefined, false);
      } else {
        for (const pkgName of projects[p]) {
          await link(pkgName, packages[pkgName], false);
        }
      }
    }
    return;
  } else if (!pathSpec) {
    // 2. read and link one
    const {packages} = readConfig(configPath);
    const savedPath = packages[packageName];
    if (!savedPath) {
      throw new Error(`No saved path found for package: ${packageName}`);
    }
    await link(packageName, savedPath, false);
    return;
  }
  // 3. link one
  const [localPath, outputDir = 'dist'] = pathSpec.split(':');

  try {
    await linkPackage(packageName, localPath, outputDir);
  } catch (e) {
    if (e instanceof HLinkExistError) {
      e.print();
      if (!(await confirm(`Link already exists for package: ${packageName}. Do you want to overwrite it?`))) {
        process.exit(0);
      }
      console.log(notImportant('Forcing link'));
      await linkPackage(packageName, localPath, outputDir, true);
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
    packages[packageName] = `${path.resolve(localPath)}:${outputDir}`;

    writeJSON(configPath, { ...config, packages });

    await checkGitIgnore(projectRoot);
    await checkPostInstall(projectRoot);
  }
}

async function linkAndSaveProject(packageName: string | undefined, pathSpec: string | undefined) {
  const { projectRoot, hasSaveFlag } = context;
  await link(packageName, pathSpec, hasSaveFlag);

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

async function unlink(packageName: string | undefined, outputDir: string | undefined, hasSaveFlag: boolean) {
  const { projectRoot } = context;

  const configPath = path.resolve(projectRoot, LOCAL_CONFIG_FILE);

  // 1. read and unlink all
  if (!packageName) {
    const { packages, projects } = readConfig(configPath);
    for (const pkgName in packages) {
      const outDir = packages[pkgName].split(':')[1] || 'dist';
      await unlink(pkgName, outDir, false);
    }
    for (const p in projects) {
      const projectPath = path.resolve(projectRoot, p);
      if (linkedProject.has(projectPath)) {
        return;
      }
      if (projects[p] === 'all') {
        await unlink(undefined, undefined, false);
      } else {
        for (const pkgName of projects[p]) {
          const outDir = packages[pkgName].split(':')[1] || 'dist';
          await unlink(pkgName, outDir, false);
        }
      }
    }
    return;
  } else if (!outputDir) {
    // 2. read and unlink one
    const { packages } = readConfig(configPath);
    const savedPath = packages[packageName]?.split(':')[1];
    if (!savedPath) {
      throw new Error(`No saved path found for package: ${packageName}`);
    }
    await unlink(packageName, savedPath, hasSaveFlag);
    return;
  }
  // 3. unlink one
  await unlinkPackage(packageName, outputDir);
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

async function unlinkAndSaveProject(packageName: string | undefined, outputDir: string | undefined) {
  const { projectRoot, hasSaveFlag } = context;

  await unlink(packageName, outputDir, hasSaveFlag);

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
  const args = process.argv.slice(2);
  extractArgs(args);
  const [action, packageName, pathSpec] = args;

  switch (action) {
  case 'link':
    await linkAndSaveProject(packageName, pathSpec);
    break;
  case 'unlink':
    await unlinkAndSaveProject(packageName, pathSpec);
    break;
  case 'relink':
    await unlinkAndSaveProject(packageName, pathSpec);
    await linkAndSaveProject(packageName, pathSpec);
    break;
  default:
    if (action) {
      console.log(chalk.yellow('Unknow command:', `"${action}"`));
    }
    showUsageAndExit();
  }
}

main();
