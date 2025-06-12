import fs from 'fs';
import path from 'path';
import { commandText, context, hardLinkDir, notImportant, pathText } from './utils';

export type IGetPackagePath = (packageName: string, outputDir: string, projectRoot?: string) => Promise<{
  outputPath: string,
  backupPath: string,
  packageDir: string,
}>;

export async function linkPackage(
  getPackagePath: IGetPackagePath,
  packageName: string,
  localPath: string,
  outputDir: string,
  force = false
) {
  const { projectRoot, hasDryRunFlag } = context;

  const { outputPath, backupPath } = await getPackagePath(packageName, outputDir, projectRoot);
  const localOutputPath = path.resolve(process.cwd(), localPath, outputDir);

  if (!fs.existsSync(localOutputPath)) {
    throw new Error(`Local output directory not found at ${localOutputPath}`);
  }

  // 1. Backup original directory
  if (fs.existsSync(outputPath)) {
    if (!fs.existsSync(backupPath)) {
      console.log(commandText('mv'), pathText(path.resolve(outputDir)), pathText(path.resolve(`${outputDir}_bak`)));
      if (!hasDryRunFlag) {
        fs.renameSync(outputPath, backupPath);
      }
    } else {
      console.log(notImportant(`${outputDir}_bak already exists, skipping backup`));
    }
  }

  // 2. Create hard links (recursively process directory structure)
  await hardLinkDir(localOutputPath, [outputPath], force);
}

export async function unlinkPackage(
  getPackagePath: IGetPackagePath,
  packageName: string,
  outputDir: string
) {
  const { projectRoot } = context;

  const { outputPath, backupPath } = await getPackagePath(packageName, outputDir, projectRoot);

  if (fs.existsSync(backupPath)) {

    // 1. Remove linked directory
    if (fs.existsSync(outputPath)) {
      console.log(commandText('rm'), '-rf', pathText(path.resolve(outputPath)));
      if (!context.hasDryRunFlag) {
        fs.rmSync(outputPath, {recursive: true, force: true});
      }
    }

    // 2. Restore backup
    console.log(commandText('mv'), pathText(path.resolve(backupPath)), pathText(path.resolve(outputDir)));
    if (!context.hasDryRunFlag) {
      fs.renameSync(backupPath, outputPath);
    }
  } else {
    console.log(notImportant(`No backup found at ${backupPath}, skipping restore`));
  }
}
