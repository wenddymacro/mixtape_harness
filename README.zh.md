# GTD —— 一套面向因果推断研究的「零错误」工作台

[English](README.md) | 中文

![实时 GTD 仪表盘](dashboard_image.png)

这个仓库是一套**研究工作台**:把规则、检查表、技能、护栏和一个实时仪表盘互相咬合在一起,让 AI 辅助的双重差分项目保持诚实、可复现、抗漂移。它是一个*模板* —— 克隆下来,对准你自己的研究,它就会在你干活的过程中强制执行零错误纪律。

它解决的问题是:当 AI 能一口气写出 200 行分析代码,人就没法再像以前那样逐行验证了。生产跑到了验证前面。这套工作台把它们重新扣在一起 —— 每张图都能追溯到某个脚本,每个阶段都有闸门,每个论断在前进之前都必须被辩护过。而且因为**人和 AI 都会漂移(方式不同)**,记录被放在磁盘上,让任何一方的记忆都无法撒谎。

它还能作为两个 bundle 装进 **DSH**(DeepSeek Harness),这样工作台的技能会出现在每个会话的技能目录里,护栏会在每次工具调用时生效。

---

## 从这里开始

1. **读 [`CLAUDE.md`](CLAUDE.md)。** 这是工作台的法律 —— 写给 AI 的,但人也该读。里面讲了:零错误是*约束*而不是目标、阶段「canister」、「你在这里」的阶段锁模型、溯源纪律、图表与幻灯片标准。
2. **打开仪表盘。** `bash code/open_dashboard.sh` 会在需要时启动它,并打印网址(`http://localhost:8080/`)。它每次请求都重读磁盘,所以永远不会陈旧;它是视觉上的执法层:陈旧产物、未复核的 diff、开着的闸门、以及管线自己给出的判定,全部用颜色标出来。
3. **开一个项目。** 用 `/newproject` 搭脚手架;如果是 DiD 设计就再跑 `/covariates`;然后照 `checklists/` 一个阶段一个阶段走。每个分析住在 `analyses/<slug>/` 里,每个阶段有自己的一间房。

---

## 在 DSH 里安装

本仓库有两个 bundle,都从 DSH 侧栏的 **Plugins** 页面安装。

| Bundle | 它带来什么 |
|---|---|
| **技能 + 仪表盘**(仓库根目录) | 每个会话的技能目录里都有工作台的技能,**外加**一个客户端半边:仪表盘被激活时,自动在右侧栏浏览器里打开它 |
| **护栏**(`dsh-guards/`) | 把 `hooks/` 里的规则变成 DSH 原生护栏 —— 原始数据不可改、不许伪造产物、不许越位画图,外加两条警告 |

### 用 git 地址安装

安装对话框接受:包名、**Git 地址**、tarball,或本地绝对路径。Git 形式就是一个普通的仓库地址 —— DSH 自己的示例是 `https://github.com/author/dsh-plugin`:

1. 侧栏 → **Plugins** → **Add plugin**。
2. 粘贴仓库地址,例如 `https://github.com/<owner>/<repo>`。
3. **Install**,装完后点 **Enable now**。
4. 看返回的 `application` 字段:**`applied`** 才代表改动生效了 —— 不是看服务端日志。
5. 开一个**新会话**,在目录里找 `amnesia`、`dashboard`、`pipeline`、`referee2`。

> **护栏那个 bundle 的 git 安装地址这里不写**,因为它位于本仓库的*子目录*里,而安装对话框收的是包规格,不是子目录。请用本地检出路径安装 —— `<检出路径>/dsh-guards` —— 或者把它拆成独立仓库。子目录那种形式**没有验证过**,所以我不声称它能用。

> **实际走过的是哪条路。** 本仓库的开发和所有验证,走的都是**本地路径**那条。git 那条路是照 DSH 自己文档里的形式写的,**没有在这里跑过** —— 如果你用了它并遇上问题,那处差异是第一个该怀疑的地方。

### 用本地检出安装

同一个对话框,把地址换成绝对路径:

- 仓库根目录 → 技能 + 仪表盘 bundle
- `<检出路径>/dsh-guards` → 护栏 bundle

### 仪表盘会自己弹出来

根 bundle 声明了 `dsh.client` 并导出 `./client`;产物是
[`lib/client.js`](lib/client.js) —— 一个手写的 bundle,形状与 DSH 官方的插件作者模板一致
(`window.__ModuleLoader__.load({ id, factory })`,factory **返回** `{ inject, apply }`),不需要任何打包步骤。

它轮询仪表盘的 `/api/health`,而那里带一个 `instance` id,**每次仪表盘启动都会变**。于是:

- **新激活一个仪表盘 → 自动打开一个右侧栏浏览器标签**;
- **刷新页面/应用 → 不会再开一个**,因为 instance 没变、已经被记下了。每次刷新都弹一个标签的插件,比没有插件更糟。

仪表盘没在运行时,它什么都不做 —— 那是常态,不是故障。要调用成功,标签类型必须存在:Desktop 上默认开启,**Web profile 默认关闭**(在 profile patch 里加 `- id: ui-sidebar-browser` / `disabled: false` 打开)。

如果你不想要客户端这一半,`bash code/open_dashboard.sh` 加 `/dashboard` 技能给你同样的效果,只是要点一下。

### 回滚与升级

在同一个 Plugins 页面移除 bundle 即可 —— 本仓库里任何东西都不会变。已安装的插件**不会自动升级**:升级 = 卸载再装新版本。

客户端 bundle 在页面打开时会热加载,所以改 `lib/client.js` 不用重启。但**新声明的 `dsh.client` 第一次激活**需要重启。

---

## 完整实例:一次端到端的 DiD 跑通

仓库里带着一个**走完的、可运行的实例**,好让这套纪律被看见而不是被描述:巴西**CAPS 精神卫生改革**
(Dias & Fontes 2024,*AEJ: Economic Policy* 16(3): 257–289),也就是
[Mixtape-Sessions Causal-Inference-2](https://github.com/Mixtape-Sessions/Causal-Inference-2) 课程用的那份数据。

```bash
# 1. 取数据,封成只读(见下面的「数据」一节)
curl -L -o /tmp/brazil.dta \
  https://github.com/scunning1975/mixtape/raw/master/brazil.dta
RAW_DIR=data/raw bash scripts/intake-raw.sh /tmp/brazil.dta

# 2. 跑整条官方管线:10 步,约 160 秒
bash code/run_pipeline.sh

# 3. 看它
bash code/open_dashboard.sh      # 打印 http://localhost:8080/
```

`run_pipeline.sh` 就是 `/pipeline` 技能所要求的契约:对每个被跟踪的产物取指纹 → 从原始数据跑完每一步 → 再取指纹 → 把逐产物判定写进
`audits/pipeline_runs/run_<stamp>.json` —— **confirmed**(逐字节复现)、**changed**(上一版是错的)、**missing**、**untouched**、**new**。

### 这次跑出了什么

```
  管线        10 步全过,159 秒
              26 confirmed · 0 changed · 0 missing · 1 untouched
  样本        5,476 个城市 · 296 个 2002 已处理(剔除)
              3,836 个从未处理 · 1,344 个分析用处理组(2003–2016)
  咬合        精神科住院    17.66 → 10.47 /万   (−41%)
              其中精分子集   7.97 →  3.43 /万   (−57%)
  估计量      simple ATT  +0.2098 (SE 0.0654) · dynamic +0.2746 (SE 0.1346)
              210 / 210 个 ATT(g,t) 单元格有限,0 个 NA
  安慰剂      绝望死:−0.0145 (SE 0.0355),p = 0.684   ← 零,正如它应该
  产物        9 张图 · 6 张表 · 1 份记录「跑不了的那一步」的说明
```

### 它发现了什么 —— 包括不舒服的部分

这是一套**以暴露问题而不是掩埋问题为目的**的工作台,所以这个实例是**连开着的闸门一起**公布的:

| 闸门 | 状态 |
|---|---|
| **ATT 的符号** | 估计是**正的** —— 采用 CAPS 与*更多*杀人案相关 —— 与已发表结果**相反**。未对账,如实报告,没有圆场。 |
| **估计包版本** | 装的是 `did` 2.1.1,上游是 2.5.1。这不是纸面问题:`aggte()` 不返回方差协方差矩阵,所以 **Step 8d(HonestDiD 敏感性)根本跑不了**。我试过用影响函数替代,实测复现不出报告的标准误(相对波动约 21%),所以**没有编一个 `sigma` 出来**。 |
| **每个协变量的处理单位数(EPV)** | 14 个 cohort 里有 7 个低于检查表的底线 7,最小 3.62。估计量照样返回了 210/210 个有限单元格 —— 但「跑出来了」和「识别干净」是两回事。 |

仪表盘把这些显示成**红色**,而不是绿色:没有任何阶段被 `LOCKED`,所以没有任何东西被签收。这正是重点。

---

## 数据

### 实例用的数据

`brazil.dta` —— Dias & Fontes (2024) 的复现面板。

| | |
|---|---|
| 规模 | 82,140 个「城市-年」 × 117 个变量 |
| 单位 | 5,476 个城市,2002–2016 |
| 大小 | 约 39 MB,Stata release 118 |
| SHA-256 | `a90429b8d135050afdd6d51cccec5d4a2ba81f5096c5989de0d2f75b88f290c5` |

### 它到底从哪来

由 **`scunning1975/mixtape`** 提供:

```
https://github.com/scunning1975/mixtape/raw/master/brazil.dta
```

它**不在** `Causal-Inference-2` 仓库里。那个仓库的 `Lab/Brazil MH Checklist/brazil.R` 是在运行时从上面的网址把它拉下来的 —— 课程 lab 就是这么拿到它的。哪天链接断了,要改的就是那一行。

### 入库与封印

原始数据是**一次性写入**的,工作台用两道机制保证:护栏拦下 agent 的写操作,而 POSIX 权限让这个拦截变成物理事实。

```bash
RAW_DIR=data/raw bash scripts/intake-raw.sh /tmp/brazil.dta   # 唯一被认可的那扇门
bash scripts/verify-raw.sh data/raw                            # 对着指纹复核
```

`intake-raw.sh` 会解开封印、复制、再封印(文件 `444`、目录 `555`),并刷新
`data/raw.manifest.sha256`。它拒绝覆盖已存在的原始文件;`--replace` 是一个响亮而刻意的动作。`--hard` 把所有权交给 `root`,连你自己改都要 `sudo`。

每一个派生面板都由脚本从封好的原始文件重建,而且每个都会写一份**账本**,说明进来多少行、出去多少行、丢掉的是为什么:

```
data/derived/panel_clean_notes.txt
  rows read (raw panel)                 : 82140
  municipality-years dropped, g == 2002 : 4440  (296 always-treated municipalities)
  rows written (panel_clean.csv)        : 77700
```

### 规矩

- 绝不修改 `data/raw/`。每一次变换都是写代码,输出到 `data/derived/`。
- 图 → `output/figures/`(PDF + PNG);表 → `output/tables/`。
- **任何数字进入正文之前,必须先存在于表文件里。** 不许伪造产物;带标注的蒙特卡洛是唯一的例外。
- 每张图、每张表都必须让**没读过论文的聪明外行**看得懂:描述性的标题、轴上有单位、副标题写清样本与时间段,卡片背面有说明。

---

## 环境要求

| 用来做什么 | 需要什么 |
|---|---|
| 仪表盘 | **Python 3**(只用标准库,不需要 pip 装东西) |
| 实例管线 | **R**,以及 `did`、`HonestDiD`、`haven`、`data.table`、`ggplot2`、`sf`、`panelView` |
| `node test.mjs` | **Node 18+**(无依赖) |
| 装进 DSH | DSH 本体 |

实例是在 R 4.1.2 上走完的,那里的 `did` 是 **2.1.1**,而上游是 **2.5.1**。这个差距被记成一个**开着的闸门**而不是藏起来,也正是 Step 8d 被阻断的原因 —— 在信任任何估计之前,先查你自己的版本。

---

## 仓库地图

| 路径 | 是什么 |
|---|---|
| `CLAUDE.md` | 工作台的法律 —— 先读这个。 |
| `checklists/` | 每个分析都要走的 DiD / 连续 DiD / 合成控制检查表。是模板,永不编辑。 |
| `analyses/` | 每个分析一个文件夹。`_template/` 是脚手架,它的 `stages/` 就是检查表各步(`00_packages` … `09_rerun`,外加 `S_signoff`)。 |
| `skills/` | 工具:`amnesia`、`newproject`、`covariates`、`pipeline`、`referee2`、`blindspot`、`drift-sweep`、`bibcheck`、`dashboard` 等。 |
| `hooks/` | 把规则*执行*下去的护栏(Claude Code 钩子形式):`protect-raw-data`、`no-fabricated-exhibit`、`no-offbook-exhibit`、`deck-from-pipeline`、`no-stale-canon`。 |
| `dsh-guards/` | 同样的规则,移植成 DSH 原生护栏。`node dsh-guards/test.mjs`。 |
| `dashboard_server.py` | 实时仪表盘 —— 检查表网格、图、表、代码、管线判定、跑动中的状态条,以及中英切换。 |
| `code/run_pipeline.sh` | 官方管线。取指纹、跑每一步、给每个产物判定。 |
| `code/open_dashboard.sh` | 没在跑就启动仪表盘,并打印网址。 |
| `lib/client.js` | DSH 的**客户端**半边:仪表盘被激活时在右侧栏打开它。 |
| `index.js` + `cordis.patch.yml` + `package.json` | DSH 的**宿主端**半边:找到自己的 `skills/`,把 DSH 的本地技能提供者挂上去。 |
| `test.mjs` | `node test.mjs` —— 101 项检查,不需要装 DSH:bundle 形状、自定位、每个技能的 frontmatter、对客户端半边的 `node:vm` **真实求值**,以及双语 README 的配对一致性。 |
| `scripts/` | 辅助脚本:`intake-raw.sh`、`seal-raw.sh`、`verify-raw.sh`,以及 R 管线。 |
| `STATE.md` | 永远最新的「我在哪」定位文件。进门先读,持续更新。 |
| `dsh-plugin/` | **已退役** —— 技能 bundle 最早的、写死机器的那个版本。只剩墓碑。 |

---

## 阶段锁模型:一张图

每个阶段只按**一条规则**上色 —— **阶段的颜色就是它的锁状态**,像商场导览图:

```
  绿 = 已完成  — 该阶段目录里有 LOCKED 文件(关门 / 已签收)
  琥珀 = 进行中 — ACTIVE_STAGE 指向的那一间(「你在这里」),任何时候只有一个
  红 = 未完成  — 其余全部(既没锁,也不是当前那间)
```

要*动*一个阶段,就解锁它(删掉它的 `LOCKED` 文件)。要往前走,就锁上你离开的那间,并把 `ACTIVE_STAGE` 指向下一间。签收就是最后一个阶段 —— 把它锁上,就意味着整个分析完成。

让它诚实的规则是:**复选框是一次核验,不是一个意向。** 事情还没发生,你可以先写下计划;但只要它还不是真的、你还没有亲眼看过,就不能勾。一个明天无法重新进入的阶段,就是错误藏身的地方 —— 所以每个阶段都是一个 *canister*,装着自己的 `ideas.md`、`todo.md`、`findings.md` 和 `exhibits.md`。

---

## 关于这个实例的说明

`CLAUDE.md` 里的贯穿实例就是巴西 CAPS 研究。本仓库展示的是一个走过的分析的*形状* —— 现在也展示它的一次真实运行,连开着的闸门一起摆在明面上。你开始自己的研究时,复制 `analyses/_template/`(或跑 `/newproject`)。

工作台本身是与领域无关的:任何「缺失的反事实是 Y(0)」的设计都适用。
