import fs from 'fs';
import path from 'path';
import { PackageDependencyHierarchy, searchForPackages } from '@pnpm/list';
import { hardLinkDir } from '@pnpm/fs.hard-link-dir';

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

async function getPackagePath(packageName: string, outputDir: string) {
  const [root] = await searchForPackages([packageName], [path.resolve()], {
    depth: Infinity,
    lockfileDir: path.resolve(),
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

export async function linkPackage(packageName: string, localPath: string, outputDir: string) {
  const { outputPath, backupPath } = await getPackagePath(packageName, outputDir);
  const localOutputPath = path.resolve(process.cwd(), localPath, outputDir);

  if (!fs.existsSync(localOutputPath)) {
    throw new Error(`Local output directory not found at ${localOutputPath}`);
  }

  // 1. Backup original directory
  if (fs.existsSync(outputPath)) {
    if (!fs.existsSync(backupPath)) {
      console.log(`mv ${outputDir} ${outputDir}_bak`);
      fs.renameSync(outputPath, backupPath);
    } else {
      console.log(`Backup ${outputDir}_bak already exists, skipping backup`);
    }
  }

  // 2. Create hard links (recursively process directory structure)
  console.log(`ln ${localOutputPath} ${outputPath}`);
  hardLinkDir(localOutputPath, [outputPath]);
}

export async function unlinkPackage(packageName: string, outputDir: string) {
  const { outputPath, backupPath } = await getPackagePath(packageName, outputDir);

  // 1. Remove linked directory
  if (fs.existsSync(outputPath)) {
    console.log(`rm -rf ${outputPath}`);
    fs.rmSync(outputPath, { recursive: true, force: true });
  }

  // 2. Restore backup
  if (fs.existsSync(backupPath)) {
    console.log(`mv ${backupPath} ${outputDir}`);
    fs.renameSync(backupPath, outputPath);
  } else {
    console.log(`No backup found at ${backupPath}, skipping restore`);
  }
}
