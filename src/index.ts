import { linkPackage, unlinkPackage } from './pnpm';

async function main() {
  const [action, packageName, pathSpec] = process.argv.slice(2);

  if (!action || !packageName) {
    console.error('Usage:');
    console.error('  hlinker link <package> <local-path>:<output-dir>');
    console.error('  hlinker unlink <package> <output-dir>');
    process.exit(1);
  }

  if (action === 'link') {
    if (!pathSpec) {
      throw new Error('Local path and output dir must be specified for link action');
    }
    const [localPath, outputDir = 'dist'] = pathSpec.split(':');
    await linkPackage(packageName, localPath, outputDir);
  } else if (action === 'unlink') {
    const outputDir = pathSpec || 'dist';
    await unlinkPackage(packageName, outputDir);
  } else {
    throw new Error(`Unknown action: ${action}`);
  }
}

main();
