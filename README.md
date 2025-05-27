translated by deepseek from [Chinese ver](./README.zh_CN.md)

# HLinker

Version Support Status:

| hlinker version | Node version | pnpm version |
|-----------------|--------------|--------------|
| v8.x            | \>=16        | v8.x         |
| v10.x           | \>=18        | v10.x        |

> Link local packages using hard links

Tools like `pnpm link` and `npm link` use symbolic links, which causes an issue where Node will search for dependencies starting from the linked package's directory. For example:

```shell
# Suppose a local project depends on antd and links to the local path/to/antd
pnpm link antd
```

When bundling, tools will look for antd's dependencies (like react) starting from `path/to/antd`.

If you've installed dependencies in antd, it will find `path/to/antd/node_modules/react`, which is usually not what you want. If not installed, it will likely fail with missing package errors.

In pnpm, you can use the `file:` protocol to avoid this issue. However, this requires modifying `package.json` and reinstalling dependencies, which isn't convenient.

Based on the `file:` protocol principle, we developed this small tool that links your local packages using hard links.

## Usage

```shell
pnpm add -D hlinker
# Create hard links
hlinker link <package> <local-path>:<output-dir> [--save]
# Or read link configurations from .hlinker.json
hlinker link
# Link a specific package, read from .hlinker.json
hlinker link <package>
# Remove links
hlinker unlink <package> <output-dir> [--save]

# Recommended to use npx for saving time
npx hlinker@10 [args]
```

`<output-dir>` is the output directory. For example, if the build output is `hlinker/dist`, then `<output-dir>` would be `dist`.

hlinker will find the real path of `<package>`, then hard link `<local-path>/<output-dir>` to `<package/real/path>/<output-dir>`. For example:

```shell
ln /path/to/abc/dist/** ./node_modules/.pnpm/abc@1.2.3/node_modules/abc/dist/**
```

The reason we don't directly hard link the entire package is that it makes backup easier. Before creating hard links, hlinker backs up `node_modules/.../abc/dist` to `node_modules/.../abc/dist_bak`, and restores it when unlinking.

If you insist on directly hard linking the package, you can pass `.` as `<output-dir>`.

You can optionally pass `--save` to save the link configuration to `.hlinker.json` in the current directory. Once saved, you can use `hlinker link` to restore all saved links.

## Notes

1. Since folders cannot be directly hard linked, we actually recreate the same directory structure and hard link individual files. Please ensure the file structure doesn't change, otherwise you'll need to relink. // TODO: postinstall hook
2. After upgrading package versions and reinstalling, you need to relink.
3. Please ensure linked files aren't deleted. For example, performing clean operations before building will break the hard links.
4. Due to differences in pnpm's package resolution code across versions, this tool isn't compatible with all versions and needs targeted installation.
