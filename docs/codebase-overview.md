# paper-in-paper コードベース概観

## ディレクトリ構成

```
src/lib/
  config/
    paperCanvasConfig.ts     設定型 + デフォルト値
  core/                      純粋 TS ロジック（React 依存なし）
    types.ts                 全データ型定義
    nanoid.ts                ID 生成
    tree.ts                  ツリー操作（add/move/remove/descendants）
    expansion.ts             展開状態操作（open/close/walk）
    expansionRules.ts        高レベル展開ルール（collapse/break chain）
    commands.ts              Command 型 + reduce + createInitialState
    layout.ts                roomWeight 計算 + roomLayout アルゴリズム
    autoClose.ts             auto-close 候補選出
  react/
    PaperCanvas.tsx          ルートコンポーネント・layoutMap 計算
    context/
      PaperStoreContext      状態ストア・dispatch・controlled/uncontrolled 同期
      LayoutContext          layoutMap（PaperId → NodeLayoutEntry）
      DragContext            ドラッグセッション・ルーム登録・hit test
      CreateChildContext     子ノード作成コールバック
      DebugContext           デバッグ表示フラグ
    hooks/
      useControllableState   controlled/uncontrolled 吸収
      useRoomSize            ResizeObserver でコンテナサイズ追跡
      usePaperLayout         状態 + サイズ → RoomLayout を導出
      useIframeBridge        HTML コンテンツ用 iframe 管理
    internal/
      paperNodeView.ts       ViewModel 導出関数
      paperColors.ts         HSL カラーテーマ
      hitTest.ts             DOM ベースのドロップ先検出
      iframeBridge.ts        srcDoc ビルダー + メッセージプロトコル
    components/
      PaperNode              スマートコンポーネント（store/drag/layout 読み取り）
      PaperNodeFrame         ダムレンダラー（header + room + 子 + アニメーション）
      PaperHeader            ヘッダー（ドラッグ・フォーカス・close・add-child）
      PaperBreadcrumbs       hidden chain のパンくずリスト
      PaperContentFrame      コンテンツレンダラー（HTML/ReactNode/ContentNode[] の3形式）
      PaperContentNodes      ContentNode[] 専用レンダラー
      CollapsedPaperNode     折り畳みノードのプレースホルダー
      FloatingLayer          ドラッグゴースト
      IndexLabel             hidden ノードのタブラベル
```

---

## 状態モデル

### PaperViewState（コアステート）

| フィールド | 型 | 説明 |
|---|---|---|
| `paperMap` | `Map<PaperId, Paper>` | 全ノードのデータ |
| `expansionMap` | `Map<PaperId, { openChildIds }>`| 開いている子の一覧 |
| `importanceMap` | `Map<PaperId, number>` | ノードごとの importance 値 |
| `accessMap` | `Map<PaperId, number>` | 最終アクセス timestamp |
| `protectedUntilMap` | `Map<PaperId, number>` | auto-close 保護期限 |
| `focusedNodeId` | `PaperId \| null` | フォーカス中ノード |
| `contentHeightMap` | `Map<PaperId, number>` | コンテンツ高さ（iframe resize 追跡用）|
| `unplacedNodeIds` | `PaperId[]` | 未配置ノードのリスト |
| `manualPlacementMap` | `Map<PaperId, ManualPlacement>` | 手動配置情報 |

### importance の動き

- 初期値: `config.importance.initial`（デフォルト 100）
- 増加: `OPEN_NODE`（+30）、`FOCUS_NODE`（+20）、`LABEL_CLICK_BOOST`（+50）、`CREATE_CHILD_NODE`（initial で初期化）
- 減少: ユーザー操作コマンド実行時に全ノード `× (1 - commandDecayRate)`（デフォルト 0.05）

### ViewModel（PaperNode 内で導出）

| フィールド | 型 | 値 |
|---|---|---|
| `visibilityMode` | `'normal' \| 'hidden'` | `entry.hidden` が true なら hidden (※現在はどこからも true に設定されていない) |
| `interactionMode` | `'idle' \| 'focused' \| 'drag-target'` | フォーカス・ドラッグ状態 |
| `roomWidth` | `number` | allocatedRect.width - borderWidth |
| `roomHeight` | `number` | allocatedRect.height - headerHeight - borderWidth |

> [!NOTE]
> 現在 `entry.hidden` を `true` に設定するロジック（サイズ閾値による自動折り畳みなど）は実装されていません。そのため、UI 上で `IndexLabel` (タブラベル) が表示されることはありません。将来的にレイアウトエンジン内で判定ロジックを実装する必要があります。

---

## レイアウトモデル

```
allocatedRect      親が割り当てた矩形
  └── room         allocatedRect から header + border を除いた領域
        ├── contentRect   本文が占める部分
        └── childRects    open な各子ノードが占める部分
```

### roomWeight の計算（`layout.ts`）

```
roomWeight(node) = rawImportance(node) + Σ roomWeight(open children)   // k = 1
```

### contentWeight

ノード自身の `importanceMap` の値をそのまま使う。
open child 数ではなく importance の相対比率で content と子の面積が決まる。

### shrink フォールバック（`usePaperLayout.ts`）

アスペクト比が minAR〜maxAR を外れた場合、roomWeight の低いノードから `SHRINK_STEP(0.84)` ずつ縮小。
最大 `MAX_SHRINK_PASSES(24)` 回繰り返す。

---

## コンテンツの3形式

| 型 | レンダラー | 特徴 |
|---|---|---|
| `string` | `<iframe>` + srcDoc | HTML コンテンツ。sandbox 内で動作 |
| `ReactNode` | インライン div | React コンポーネントをそのまま埋め込む |
| `ContentNode[]` | `PaperContentNodes` | 構造化データ。JSON シリアライザブル |

---

## 改善点

### [Bug] expansionRules.ts の ruleOpen が誤実装

```ts
export function ruleOpen(parentId: PaperId): ExpansionRule {
  return (map) => openChild(map, parentId, parentId); // parentId を childId にも渡している
}
```

本来 `openChild(map, parentId, nodeId)` のはず。ただし `ruleOpen` は現在どこからも呼ばれていないため表面上は無害。

---

### [Bug] DragContext のイベントリスナーが重複登録される可能性

`handlePointerMove` / `handlePointerUp` が `useCallback` の外で定義されている通常関数。
`startDrag` の `useCallback` に閉じ込められているが、`startDrag` 自体は再生成されないため実害は出にくい。
ただし `endDrag` で `window.removeEventListener` を呼んでいる時点では関数参照が変わっている恐れがあり、リスナーが残り続けるケースがありうる。

---

### [Dead code] CollapsedPaperNode が未使用

`CollapsedPaperNode` コンポーネントはどこからも import されていない。

---

### [Smell] paperNodeView.ts の dead params

`derivePaperVisibilityMode` のシグネチャ:

```ts
function derivePaperVisibilityMode({
  isRoot,   // 使われていない
  entry,
  config,   // 使われていない
}: { isRoot: boolean; entry: ...; config: PaperNodeConfig })
```

また ViewModel の `roomWidth` / `roomHeight` は PaperNodeFrame で使われておらず、layout.contentRect / childRects から直接読んでいる。

---

### [Smell] PaperNode が ViewModel をすぐブール分解して渡している

```ts
const view = derivePaperNodeViewModel(...);
const isFocusedView = view.interactionMode === 'focused';   // 再分解
const isDragTargetView = view.interactionMode === 'drag-target';
```

ViewModel を作るメリットが薄い。PaperNodeFrame に `interactionMode` を直接渡すか、ViewModel 自体を渡す形に統一すべき。

---

### [Smell] PaperBreadcrumbs が `__SYNC_EXPANSION` を直接 dispatch

`__SYNC_*` コマンドは外部からの prop 同期用のプライベート規約だが、内部ロジックから呼んでいる:

```ts
dispatch({ type: '__SYNC_EXPANSION', expansionMap: next });
```

`expansionRules` の結果を適用するための公開コマンド（例: `APPLY_EXPANSION_RULE`）があるべき。

---

### [Smell] useIframeBridge の cleanup が `(el as any).__cleanup` ハック

ref callback でマウント時にイベントを登録しているが、クリーンアップを DOM プロパティに直接格納している。
ref オブジェクト + useEffect でクリーンアップを管理する標準パターンに変更できる。

---

### [Smell] PaperContentFrame の height が二重管理

ローカル `useState(60)` でも管理しつつ、`REPORT_CONTENT_HEIGHT` でストアにも送信。
ストアの `contentHeightMap` は `usePaperLayout` の `_contentHeightMap` 引数として渡されているが、内部で未使用（`_` プレフィックス）。

---

### [Smell] IndexLabel の side が常に 'left' に固定

`PaperCanvas` の `collapsedNodes` 生成ロジックで side が `'left'` ハードコードされている。

---

### [考慮] content 3形式の管理コスト

`string`（iframe）・`ReactNode`・`ContentNode[]` の3パスは、追加機能（検索・シリアライズ等）を実装するたびに3つ全てに対応が必要になる。長期的には `ContentNode[]` に一本化する方向が保守しやすい。
