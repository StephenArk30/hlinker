import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { IGetPackagePath } from './link-pkg';
import { parsePackageName } from './utils';

const require = createRequire(import.meta.url);

function findPackageWithVersion(
  packageName: string,
  version: string | undefined,
  searchDir: string,
  visited: Set<string> = new Set()
): string | null {
  const normalizedDir = path.normalize(searchDir);
  if (visited.has(normalizedDir)) return null;
  visited.add(normalizedDir);

  const nodeModulesPath = path.join(normalizedDir, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) return null;

  const packages = fs.readdirSync(nodeModulesPath);
  for (const pkg of packages) {
    const packagePath = path.join(nodeModulesPath, pkg);

    if (pkg.startsWith('@')) {
      const scopedPackages = fs.readdirSync(packagePath);
      for (const scopedPkg of scopedPackages) {
        const scopedPackagePath = path.join(packagePath, scopedPkg);
        const result = checkPackage(scopedPackagePath, `${pkg}/${scopedPkg}`);
        if (result) return result;
      }
    } else {
      const result = checkPackage(packagePath, pkg);
      if (result) return result;
    }
  }

  const parentDir = path.dirname(normalizedDir);
  if (parentDir !== normalizedDir) {
    const parentResult = findPackageWithVersion(packageName, version, parentDir, visited);
    if (parentResult) return parentResult;
  }

  return null;

  function checkPackage(packageDir: string, currentPackageName: string): string | null {
    if (currentPackageName !== packageName) return null;

    try {
      const packageJsonPath = path.join(packageDir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) return null;

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      if (!version || packageJson.version === version) {
        return packageDir;
      }

      const nestedResult = findPackageWithVersion(
        packageName,
        version,
        packageDir,
        visited
      );
      if (nestedResult) return nestedResult;
    } catch {
      // pass
    }
    return null;
  }
}

function findPackageDir(packageEntry: string): string {
  let dir = path.dirname(packageEntry);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return path.dirname(packageEntry);
}

function preparePaths(packageDir: string, outputDir: string) {
  const outputPath = path.join(packageDir, outputDir);
  const backupPath = path.join(packageDir, `${outputDir}_bak`);
  return { outputPath, backupPath, packageDir };
}

export const getPackagePath: IGetPackagePath = async (rawPackageName, outputDir, projectRoot) => {
  const root = projectRoot || process.cwd();

  const { name, version } = parsePackageName(rawPackageName);

  if (!version) {
    try {
      const packageEntry = require.resolve(name, { paths: [root] });
      const packageDir = findPackageDir(packageEntry);
      return preparePaths(packageDir, outputDir);
    } catch {
      // pass
    }
  }

  const packageDir = findPackageWithVersion(name, version, root);
  if (!packageDir) {
    throw new Error(`Package not found: ${rawPackageName}${version ? `@${version}` : ''}`);
  }

  return preparePaths(packageDir, outputDir);
}
