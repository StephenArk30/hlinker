# HLinker

版本支持情况：

| hlinker 版本 | node版本 | pnpm版本 |
|------------|--------|--------|
| v8.x       | \>=16  | v8.x   |
| v10.x      | \>=18  | v10.x  |

> 用硬链接方式链接本地包

pnpm link, npm link 等都是用软链接，造成一个问题就是 node 寻包时会去到链接包的目录下寻找。例如：

```shell
# 假设本地有 project 依赖 antd，link 到本地的 path/to/antd
pnpm link antd
```

那么在打包时，寻找 antd 依赖的 react，会从 path/to/antd 开始向上寻找 node_modules 里的 react。

如果你在 antd 中安装过，那么会找到 path/to/antd/node_modules/react，这多半是你不想要的。如果不安装则多半会因为找不到包而报错。

在 pnpm 中，你可以用 `file:` 协议来规避这个问题。但必须修改 package.json 并重新安装依赖，并不方便。

根据 `file:` 协议的原理，开发了这个小工具。它可以通过硬链接的方式链接你的本地包。

## 用法

```shell
pnpm add -D hlinker
# 建立硬链接
hlinker link <package> <local-path>:<output-dir> [--save] [--project <project-path>]
# 或直接从 .hlinker.json 读取链接配置
hlinker link
# 只 link 某个包，从 .hlinker.json 读取
hlinker link <package>
# 取消链接
hlinker unlink <package> <output-dir> [--save] [--project <project-path>]

# 推荐使用 npx 来节省时间
npx hlinker@10 [args]
```

`<output-dir>` 是产物文件夹。例如打包后产物如果是 hlinker/dist，那么 `<output-dir>` 就是 `dist`。

hlinker 会找到 `<package>` 的真实路径，然后将 `<local-path>/<output-dir>` 硬链接到 `<package/real/path>/<output-dir>`。例如：

```shell
ln /path/to/abc/dist/** ./node_modules/.pnpm/abc@1.2.3/node_modules/abc/dist/**
```

之所以不是直接硬链接 abc，是因为这样比较好做备份。在硬链接之前会备份好 `node_modules/.../abc/dist` 到 `node_modules/.../abc/dist_bak`，在 unlink 时会把备份的文件夹还原回来。

如果执意要直接硬链接 abc，`<output-dir>` 直接传 `.` 也是可以的。

可选传入 --save 来将 link 保存到当前目录的 .hlinker.json。保存后，可以直接使用 `hlinker link` 来恢复所有保存的链接。

可传入 --project 改变 projectRoot，例如在 A 包：

```shell
hlinker link --project ../B
```

就会读取 ../B/.hlinker.json，恢复 B 包的硬链接。

## 注意事项

1. 由于不能直接硬链接文件夹，所以实际是构建了相同的目录结构，然后一个个文件硬链接。请确保文件结构不要发生变化，否则需要重新链接。
2. 升级包版本并安装后，需要重新链接。 // TODO: postinstall 钩子
3. 请确保被硬链接的文件不要被删除。例如在打包之前做了 clean 操作等，会导致硬链接失效
4. 由于 pnpm 的寻包代码每个版本不一样，本工具并不能兼容所有版本，需要针对性安装
