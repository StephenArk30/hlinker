import { getPackagePath as getPackagePathPnpm } from './pnpm';
import { getPackagePath as getPackagePathNpm } from './npm';
import { IGetPackagePath, linkPackage as baseLinkPackage, unlinkPackage as baseUnlinkPackage } from './link-pkg';
import fs from 'fs';
import path from 'path';
import { context, notImportant, warnText } from './utils';

const getPackagePathMap: Record<string, IGetPackagePath> = {
  pnpm: getPackagePathPnpm,
  npm: getPackagePathNpm,
  yarn: getPackagePathNpm,
  unknow: getPackagePathNpm,
};

function getProjectType(projectRoot?: string): keyof typeof getPackagePathMap {
  const projectPath = projectRoot || process.cwd();
  if (fs.existsSync(path.resolve(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.resolve(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.resolve(projectPath, 'package-lock.json'))) {
    return 'npm';
  }
  return 'unknow';
}

let loggedProjectType = false;

export function linkPackage(
  packageName: string,
  localPath: string,
  outputDir: string,
  force = false
) {
  const { projectRoot } = context;
  const projectType = getProjectType(projectRoot);
  if (!loggedProjectType) {
    loggedProjectType = true;
    if (projectType === 'unknow') {
      console.log(warnText('Unknow project type, treat as npm'));
    } else {
      console.log(notImportant('Project type:', projectType));
    }
  }

  return baseLinkPackage(
    getPackagePathMap[projectType],
    packageName,
    localPath,
    outputDir,
    force
  );
}

export function unlinkPackage(
  packageName: string,
  outputDir: string
) {
  const { projectRoot } = context;

  return baseUnlinkPackage(
    getPackagePathMap[getProjectType(projectRoot)],
    packageName,
    outputDir
  );
}
