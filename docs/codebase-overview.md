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
    nodeLayoutPolicy.ts      indexed / branch / leaf の表示ポリシー導出
    layout.ts                demand snapshot + roomLayout アルゴリズム
    autoClose.ts             auto-close 候補選出
  react/
    PaperCanvas.tsx          ルートコンポーネント・hook orchestration
    context/
      PaperStoreContext      状態ストア・dispatch・controlled/uncontrolled 同期
      LayoutContext          layoutMap + node 単位購読
      DragContext            ドラッグセッション・ルーム登録・hit test
      CreateChildContext     子ノード作成コールバック
      DebugContext           デバッグ表示フラグ
    hooks/
      useRoomSize            ResizeObserver でコンテナサイズ追跡
      useCanvasLayoutSnapshot canvas 全体の layout / demand snapshot 構築
      useOverflowAutoClose   overflow 監視と INDEX_CONTENT / AUTO_CLOSE_NODE dispatch
      useIndexLabels         左側 index label の packed layout
      useIframeBridge        HTML コンテンツ用 iframe 管理
    internal/
      paperNodeView.ts       interaction / room size ViewModel 導出
      paperNodeRenderModel.ts PaperNode 描画用 selector
      paperContentHtml.ts    HTML content 表示用 helper
      canvasDebug.ts         debug 文字列生成
      paperColors.ts         HSL カラーテーマ
      hitTest.ts             DOM ベースのドロップ先検出
      iframeBridge.ts        srcDoc ビルダー + メッセージプロトコル
    components/
      PaperNode              node 単位 selector を使う orchestration component
      PaperNodeFrame         ダムレンダラー（header + room + 子 + アニメーション）
      PaperHeader            ヘッダー（ドラッグ・フォーカス・close・add-child）
      PaperBreadcrumbs       パンくずリスト
      PaperContentFrame      コンテンツレンダラー（HTML/ReactNode/ContentNode[] の3形式）
      PaperContentNodes      ContentNode[] 専用レンダラー
      PaperCanvasDebugPanel  debug overlay
      FloatingLayer          ドラッグゴースト
```

---

## 状態モデル

### PaperViewState（コアステート）

| フィールド | 型 | 説明 |
|---|---|---|
| `paperMap` | `Map<PaperId, Paper>` | 全ノードのデータ |
| `expansionMap` | `Map<PaperId, { openChildIds }>`| 開いている子の一覧 |
| `indexedContentIds`| `Set<PaperId>` | 本文が左ラベルへ退避しているノードの ID |
| `attentionMap` | `Map<PaperId, number>` | ノードごとの attention 値 |
| `attentionTimestampMap` | `Map<PaperId, number>` | lazy decay 用の最終更新時刻 |
| `accessMap` | `Map<PaperId, number>` | 最終アクセス timestamp |
| `protectedUntilMap` | `Map<PaperId, number>` | auto-close 保護期限 |
| `focusedNodeId` | `PaperId \| null` | フォーカス中ノード |
| `contentHeightMap` | `Map<PaperId, number>` | コンテンツ高さ（iframe resize 追跡用）|
| `unplacedNodeIds` | `PaperId[]` | 未配置ノードのリスト |
| `manualPlacementMap` | `Map<PaperId, ManualPlacement>` | 手動配置情報 |

### attention の動き

- 初期値: `config.attention.initial`
- 増加: `OPEN_NODE` / `FOCUS_NODE` / `LABEL_CLICK_BOOST`
- 減衰: `attentionTimestampMap` を使った lazy decay
- レイアウトには attention を直接使わず、`contentDemand` / `roomDemand` に変換して使う

### ViewModel（PaperNode 内で導出）

| フィールド | 型 | 値 |
|---|---|---|
| `interactionMode` | `'idle' \| 'focused' \| 'drag-target'` | フォーカス・ドラッグ状態 |
| `roomWidth` | `number` | allocatedRect.width - borderWidth |
| `roomHeight` | `number` | allocatedRect.height - headerHeight - borderWidth |
| `layoutPolicy`| `NodeLayoutPolicy` | `expanded / indexed-branch / indexed-leaf` の表示ルール |

---

## レイアウトモデル

```
allocatedRect      親が割り当てた矩形
  └── room         allocatedRect から header + border を除いた領域
        ├── contentRect   本文が占める部分（isContentIndexed なら面積 0）
        └── childRects    open な各子ノードが占める部分
```

### demand snapshot の計算（`layout.ts`）

```
contentDemand(node) = intrinsicContentHeight(node) * attentionMultiplier(node)
roomDemand(node) = contentDemand(node) + Σ roomDemand(open children)
```

`DemandSnapshot` には次の派生値が入る。

- `policyMap`
- `contentDemandMap`
- `roomDemandMap`
- `effectiveAttentionMap`

### indexed node の扱い

- `indexed-branch`
  - header なし
  - contentRect は 0
  - child room は残す
  - 左側 `IndexLabel` を表示する
- `indexed-leaf`
  - header なし
  - contentRect は 0
  - parent layout 上の room も 0
  - 左側 `IndexLabel` だけ残す

### 自動スペース管理（`useOverflowAutoClose.ts`）

面積が逼迫し `overflowChildCount > 0` となった場合、以下の2段階で自動調整が行われる。

1.  **INDEX_CONTENT**: 重要度の低いノードの本文を畳み、スペースを空ける。
2.  **AUTO_CLOSE_NODE**: 本文を畳んでもなお不足する場合、ノードを完全に閉じ（通常のカード化）、親の展開リストから外す。

### shrink フォールバック（`layout.ts`）

アスペクト比が minAR〜maxAR を外れた場合、roomDemand の低いノードから `SHRINK_STEP(0.84)` ずつ縮小。
最大 `MAX_SHRINK_PASSES(6)` 回繰り返す。

---

## 直近の最適化

### 5. node 単位購読を導入

この最適化の狙いは、「1 node の状態変化で tree 全体の `PaperNode` が巻き込まれて再 render される範囲を減らす」こと。

以前の `PaperNode` は次の2つを直接読んでいた。

- `PaperStoreContext` の `state` 全体
- `LayoutContext` の `layoutMap` 全体

この構造だと、たとえば次のような局所的な変更でも再 render の波及範囲が広くなりやすい。

- 1つの node の `focusedNodeId` 変更
- 1つの node の `indexedContentIds` 変更
- 1つの node の layout entry 更新
- drag target の更新

#### 何を追加したか

##### `PaperStoreContext` の selector 層

- `PaperStoreSelectorContext`
- `usePaperStoreSelector()`

`PaperStoreProvider` は reducer state をそのまま React context に入れるだけでなく、内部に小さな subscription store を持つ。

- `getSnapshot(): { state, config }`
- `subscribe(listener)`

`usePaperStoreSelector()` はこの subscription store にぶら下がり、呼び出し側が必要な slice だけ選ぶ。

```ts
usePaperStoreSelector(({ state, config }) => {
  return {
    paper: state.paperMap.get(nodeId),
    isFocused: state.focusedNodeId === nodeId,
    nodeIsIndexed: state.indexedContentIds.has(nodeId),
    parentIsIndexed: parentId ? state.indexedContentIds.has(parentId) : false,
    effectiveAttention: getEffectiveAttention(state, nodeId, config, Date.now()),
  };
}, isEqual)
```

重要なのは、`PaperNode` が `state` 全体を直接受け取らず、selector の返り値だけを state として持つこと。

##### `LayoutContext` の selector 層

- `LayoutSelectorContext`
- `useLayoutEntry(nodeId)`

`LayoutContextProvider` も同じく subscription store を持つ。

- `getSnapshot(): Map<PaperId, NodeLayoutEntry>`
- `subscribe(listener)`

`useLayoutEntry(nodeId)` は `layoutMap.get(nodeId)` だけを購読する。

これにより `PaperNode` は

- 自分の `entry`
- 親の `entry`

だけを読む。

#### `PaperNode` がどう変わったか

以前:

- store 全体を読む
- layoutMap 全体を読む
- その場で tone / share / policy / debug badge を組み立てる

現在:

- `usePaperStoreSelector()` で current node に必要な state slice を読む
- `useLayoutEntry(nodeId)` と `useLayoutEntry(parentId)` だけを読む
- `derivePaperNodeRenderModel()` に渡して描画 props を作る

つまり `PaperNode` は「global map を全部覗く component」から、「node 単位の selector をつなぐ component」へ役割が変わった。

#### なぜこれで速くなるのか

React context は value が変わると、その context を読んでいる subtree が広く再評価されやすい。

特に recursive tree UI では、

- node 数が多い
- `PaperNode` が深く再帰する
- drag / focus / auto-index で更新頻度が高い

ので、context 丸読みはコストが目立ちやすい。

node 単位購読にすると、

- `paperMap` のうち current node に関係ない部分の変化
- `layoutMap` のうち current node / parent node に関係ない部分の変化

では `PaperNode` の selector 結果が変わらないため、再 render を抑えやすい。

#### どこまで最適化したか

今回の最適化で改善したのは主に `PaperNode` の巻き込み範囲。

具体的には次の計算が node 単位へ局所化された。

- current node の `paper`
- current node の `focused` 判定
- current node / parent node の `indexed` 判定
- current node の `layout entry`
- parent node の `layout entry`

一方で、まだ全体計算のまま残っているものもある。

- `PaperCanvas` の `layoutSnapshot` 構築
- overflow 判定と `INDEX_CONTENT` / `AUTO_CLOSE_NODE` dispatch
- debug パネル全体

なので、これは「すべての再計算を止めた」最適化ではなく、「recursive node rendering の再 render 範囲を狭めた」最適化である。

#### 実装上の注意点

この方式は便利だが、selector 実装を雑にすると逆に無限更新や余計な再 render を起こしやすい。

今回気をつけている点:

- selector の購読更新は `subscribe(listener)` 経由だけにする
- render ごとに変わる selector 関数を `useEffect` の依存に入れて `setState` しない
- `usePaperStoreSelector()` は `isEqual` で前回値と比較して不要な更新を落とす
- `useLayoutEntry(nodeId)` も `prev === next` 比較で局所更新に寄せる

実際、途中で selector 用の `useEffect` が毎 render `setState` を叩いて update depth exceeded を起こしたため、その effect は削除して subscription 駆動に戻している。

#### 今後の余地

この最適化は `PaperNode` には効いているが、まだ次の余地がある。

- `PaperBreadcrumbs`
- `PaperContentFrame`
- `PaperHeader`

など、他の store 直読 component も必要なら selector 化できる。

ただしコスパが最も高いのは recursive node 本体なので、まず `PaperNode` を node 単位購読へ変えた。

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

### [Smell] PaperNode が ViewModel をすぐブール分解して渡している

```ts
const view = derivePaperNodeViewModel(...);
const isFocusedView = view.interactionMode === 'focused';   // 再分解
const isDragTargetView = view.interactionMode === 'drag-target';
```

ViewModel を作るメリットが薄い。PaperNodeFrame に `interactionMode` を直接渡すか、ViewModel 自体を渡す形に統一すべき。

---

### [Smell] useIframeBridge の cleanup が `(el as any).__cleanup` ハック

ref callback でマウント時にイベントを登録しているが、クリーンアップを DOM プロパティに直接格納している。
ref オブジェクト + useEffect でクリーンアップを管理する標準パターンに変更できる。

---

### [Smell] PaperContentFrame の height が二重管理

ローカル `useState(60)` でも管理しつつ、`REPORT_CONTENT_HEIGHT` でストアにも送信。
現在は iframe 自体の表示高さと、layout engine が使う `contentHeightMap` が別用途のため共存している。片方に寄せるなら、iframe 高さを完全にストア駆動にするか、逆に layout 側の需要計算だけへ責務を限定する整理が必要。

---

### [考慮] content 3形式の管理コスト

`string`（iframe）・`ReactNode`・`ContentNode[]` の3形式は、追加機能（検索・シリアライズ等）を実装するたびに3つ全てに対応が必要になる。長期的には `ContentNode[]` に一本化する方向が保守しやすい。
