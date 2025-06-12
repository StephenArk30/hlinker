import path from 'path';
import { PackageDependencyHierarchy, searchForPackages } from '@pnpm/list';
import { IGetPackagePath } from './link-pkg';

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

export const getPackagePath: IGetPackagePath = async (packageName, outputDir, projectRoot) => {
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
