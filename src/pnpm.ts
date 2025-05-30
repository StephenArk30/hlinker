import fs from 'fs';
import path from 'path';
import { PackageDependencyHierarchy, searchForPackages } from '@pnpm/list';
import { commandText, hardLinkDir, notImportant, pathText } from './utils';

type IDepKey = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'unsavedDependencies';
const DEP_KEYS: IDepKey[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'unsavedDependencies',
];
function findDepPath(packageName: string, hierarchy: PackageDependencyHierarchy): string | void {
  for (const k of DEP_KEYS) {
    const deps = hierarchy[k];
    if (!deps) continue;
    for (const dep of deps) {
      if (dep.name === packageName) {
        return dep.path;
      }
      const path = findDepPath(packageName, dep);
      if (path) return path;
    }
  }
}

async function getPackagePath(packageName: string, outputDir: string, projectRoot?: string) {
  const [root] = await searchForPackages([packageName], [projectRoot || path.resolve()], {
    depth: Infinity,
    lockfileDir: projectRoot || path.resolve(),
  });
  const packageDir = findDepPath(packageName, root);
  if (!packageDir) {
    throw new Error(`Could not find ${packageName} in dependency tree`);
  }

  const outputPath = path.join(packageDir, outputDir);
  const backupPath = path.join(packageDir, `${outputDir}_bak`);

  return {
    outputPath,
    backupPath,
    packageDir,
  }
}

export async function linkPackage(packageName: string, localPath: string, outputDir: string, projectRoot?: string, force = false) {
  const { outputPath, backupPath } = await getPackagePath(packageName, outputDir, projectRoot);
  const localOutputPath = path.resolve(process.cwd(), localPath, outputDir);

  if (!fs.existsSync(localOutputPath)) {
    throw new Error(`Local output directory not found at ${localOutputPath}`);
  }

  // 1. Backup original directory
  if (fs.existsSync(outputPath)) {
    if (!fs.existsSync(backupPath)) {
      console.log(commandText('mv'), pathText(outputDir), pathText(`${outputDir}_bak`));
      fs.renameSync(outputPath, backupPath);
    } else {
      console.log(notImportant(`${outputDir}_bak already exists, skipping backup`));
    }
  }

  // 2. Create hard links (recursively process directory structure)
  await hardLinkDir(localOutputPath, [outputPath], force);
}

export async function unlinkPackage(packageName: string, outputDir: string, projectRoot?: string) {
  const { outputPath, backupPath } = await getPackagePath(packageName, outputDir, projectRoot);

  // 1. Remove linked directory
  if (fs.existsSync(outputPath)) {
    console.log(commandText('rm'), '-rf', pathText(outputPath));
    fs.rmSync(outputPath, { recursive: true, force: true });
  }

  // 2. Restore backup
  if (fs.existsSync(backupPath)) {
    console.log(commandText('mv'), pathText(backupPath), pathText(outputDir));
    fs.renameSync(backupPath, outputPath);
  } else {
    console.log(notImportant(`No backup found at ${backupPath}, skipping restore`));
  }
}
