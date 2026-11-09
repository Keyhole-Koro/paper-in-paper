# paper-in-paper コードベース概観

## ディレクトリ構成

```
src/lib/
  config/
    paperCanvasConfig.ts     設定型 + デフォルト値 + 値ベースのキー
  core/                      純粋 TS ロジック（React 依存なし）
    types.ts                 データ型定義
    tree.ts                  ツリー操作（循環安全な子孫/祖先探索、move/remove/add、checkTreeInvariants）
    expansion.ts             展開状態操作（open/detach/close/prune、木と整合する子だけを返す getVisibleChildIds）
    attention.ts             操作クロックによる注意度の減衰、倍率、保護判定
    nodeRegistry.ts          id ごとの状態（注意度・アクセス・保護・インデックス）のライフサイクル
    nodeVisibility.ts        expanded / indexed / closed の導出
    nodeLayoutPolicy.ts      expanded / indexed-branch / indexed-leaf の表示ポリシー
    contentMass.ts           本文量の推定（レイアウトの需要に使う）
    layout.ts                需要スナップショット、部屋の分割、キャンバス全体のレイアウト
    spaceManagement.ts       窮屈な部屋の解消（インデックス化 → 自動クローズ）を収束まで適用
    commands.ts              Command 型 + reduce + createInitialState
    paperMapBuilder.ts       静的ツリー用ビルダー
    nanoid.ts                id 生成（非セキュアコンテキスト向けフォールバック付き）
  react/
    PaperCanvas.tsx          公開コンポーネント。ストア生成、プロップ同期、コールバック、ハンドル
    store/
      createPaperStore.ts    外部ストア（state + 派生レイアウト + インデックスラベル）
      storeContext.ts        useStoreValue / useLayoutEntry / usePaperStoreSelector / usePaperDispatch
    drag/
      dragStore.ts           ドラッグセッション・当たり判定・window リスナーを持つ外部ストア
      dragContext.ts         useDragStore / useDragValue
    context/
      CanvasOptionsContext   表示オプション（debug, draggable, colorScheme, labels...）と最新コールバック
    components/
      PaperNode              1 ペーパー。自分のレイアウト・データ・フォーカスだけを購読（memo）
      PaperNodeFrame         枠・部屋・子・ドロップ表示
      PaperHeader            タイトルバー（親のパンくず、フォーカス、ドラッグ、ピン、閉じる、追加）
      PaperContentFrame      本文の 3 形式の振り分け
      PaperHtmlContent       サンドボックス iframe（公開コンポーネント）
      PaperContentNodes      ContentNode[] レンダラー
      IndexLabel             左端のインデックスラベル
      FloatingLayer          ドラッグのゴースト
      PaperCanvasDebugPanel  デバッグ表示
    hooks/
      useIframeBridge        iframe との接続（ハンドシェイク、専用ポート、生存確認）
      useMediaQuery          prefers-reduced-motion / prefers-color-scheme
      useSiblingShare        兄弟間シェアのプレビュー（公開）
      useCanvasSelector      キャンバス外からの購読（公開）
    internal/
      iframeBridge.ts        srcDoc（nonce の CSP 付き）、bootstrap スクリプト、イベント検証、リンク抽出
      frameRegistry.ts       pip:hello を受け、送信元が現在の contentWindow のフレームへ渡す
      childOrder.ts          子の DOM 順（childIds 順で固定）とレイアウト順
      openPaperLink.ts       data-paper-id リンクの解決（子は OPEN、それ以外は REVEAL）
      hitTest.ts             ドロップ先の判定
      indexLabels.ts         ラベルの配置
      paperColors.ts         HSL のトーン（ライト / ダーク）
      contentTheme.ts        トーン → 本文の配色
      loadImage.ts           画像マーカーの読み込み
      canvasDebug.ts         デバッグ文字列
test/                        vitest（core / react / helpers）
e2e/                         Playwright（デモと harness.html に対するブラウザテスト）
```

---

## 状態モデル

### PaperViewState

| フィールド | 説明 |
|---|---|
| `paperMap` | 全ノード |
| `expansionMap` | 親ごとの開いている子（順序 = レイアウト順）。未読み込みの id を含んでよい |
| `indexedContentIds` | 本文がインデックスラベルに退避しているノード |
| `unplacedNodeIds` | 木に属していないノード |
| `focusedNodeId` | フォーカス中のノード |
| `clock` | 操作のクロック。開く・フォーカス・表示・移動・並べ替え・ラベル・作成で +1 |
| `attentionMap` / `attentionTimestampMap` | 注意度の基準値と、それを設定したクロック値 |
| `accessMap` | 最後に触れたクロック値（同点時の優先度） |
| `protectedUntilMap` | このクロック値まで空間管理の対象外 |

注意度は時刻ではなく操作のクロックで減衰するので、`state` だけからレイアウトが決まります（`Date.now()` を使わない）。

### 不変条件

- ツリーの不変条件（`checkTreeInvariants`）はどのコマンド列でも崩れない
- id ごとの状態は、存在するノードについてのみ持つ
- レイアウトと描画は、木と整合する展開エントリだけをたどり、各ノードを一度しか訪れない

これらはランダムなコマンド列を流し込むテスト（`test/core/invariants.test.ts`）で検証しています。

---

## 更新の流れ

```
ユーザー操作 / ホストのプロップ
  → store.dispatch(command)
  → reduce（純粋）
  → settleSpace: レイアウト → 窮屈なら INDEX/AUTO_CLOSE を 1 つ適用 → … を収束まで
  → スナップショット（state, config, rootId, layout, indexLabels）を差し替え
  → 購読者へ同期的に通知（React は useSyncExternalStore で読む）
```

- レイアウトの各エントリは、前回と値が同じなら同じオブジェクトを使い回します。`PaperNode` は自分のエントリ・自分の `Paper`・自分がフォーカスされているか、だけを購読しているので、関係ない変更では再レンダリングされません。
- ドラッグ状態は別のストアです。ポインタ移動で再レンダリングされるのはゴーストだけ、ドロップ先が変わったときはその部屋だけです。
- `paperMap` などのプロップは `useLayoutEffect` でストアに同期します（描画前に反映されるので古いフレームは見えません）。

---

## 本文の 3 形式

| 型 | レンダラー | 特徴 |
|---|---|---|
| `string` | `PaperHtmlContent`（iframe + srcDoc） | サンドボックス + nonce の CSP。秘密値付きの MessageChannel で通信し、別ページに遷移したら表示を止める。高さは本文に合わせる |
| `ReactNode` | インライン div | `data-paper-id` のクリック / Enter / Space をリンクとして扱う |
| `ContentNode[]` | `PaperContentNodes` | JSON シリアライズ可能 |

---

## テスト

| 場所 | 内容 |
|---|---|
| `test/core` | 各コマンド、ツリー・展開操作、注意度、レイアウトの性質（敷き詰め・比率・最小シェア）、空間管理、本文量推定、ランダムなコマンド列での不変条件 |
| `test/react` | ストア、キャンバスの操作、プロップ同期とコールバック、再レンダリング回数、ドラッグ、iframe のハンドシェイク・遷移検知・ドラッグ転送、bootstrap スクリプト（スクリプト有効の jsdom で実行）、当たり判定、ラベル、フック |
| `e2e` | 実ブラウザでのリンク、祖先リンク、CSP、外部リンク、ドラッグ、キーボード、小さい画面。`harness.html` ではテストごとのペーパーで、DOM clobbering、遷移の遮断、フレーム内から始まるドラッグ、StrictMode なしでの並べ替え後のリンク |

`PIP_FUZZ_SEEDS=300 npx vitest run test/core/invariants.test.ts` でランダムテストのシード数を増やせます。
