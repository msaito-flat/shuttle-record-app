# Code review, repair, and patch guidance

## Purpose
- 既存コードのレビューを行い、バグ・品質問題・保守性問題を「再現→原因特定→最小修正→検証→差分提示」まで一気通貫で実施する。
- “指摘だけ”で終わらず、原則として **動作する修正（patch）** と **検証結果** をセットで出す。

## When to use
- PR/差分レビュー、バグ修正依頼、CI失敗の原因調査、リファクタ提案（ただし最小差分）、
  依存関係・型・lint・テストの崩れ対応。

## Inputs (ask for / infer)
- 期待動作（Spec / acceptance criteria）
- 失敗ログ（CIログ、例外、再現手順）
- 変更範囲の制約（触って良い/悪い領域、互換性、締切）
- 実行環境（言語/バージョン、OS、ビルド/テストコマンド）
- コーディング規約（formatter/linter、命名、例外方針）

## Output contract (must deliver)
1) **Review summary**（主要論点、重大度、なぜ問題か）
2) **Fix summary**（何をどう変えたか、影響範囲、互換性）
3) **Verification**（実行したコマンド、結果、残課題）
4) **Patch / diff**（最小差分。必要なら複数コミット案も提示）
5) **Risks & follow-ups**（想定リスク、追加テスト、段階導入案）

---

## Process (non-negotiable)

### 1. Establish baseline
- まず現状の状態を把握する（CI/ローカルでの失敗点を固定）。
- 実行可能なら以下を順に行い、**最初の失敗**を特定する。
  - `format` / `lint`
  - `typecheck`（ある場合）
  - `test`（ユニット→統合の順）
  - `build`（必要な場合）
- 「今、何が壊れているか」を明確化してから修正に入る。

### 2. Review (find issues)
- 変更差分を読み、以下観点でチェックする（MECEで落とす）：
  - Correctness: ロジック、境界値、null/例外、並行性、再入性
  - Safety/Security: 入力検証、権限、認可、秘密情報、インジェクション、パストラバーサル
  - Reliability: エラーハンドリング、リトライ、タイムアウト、冪等性
  - Performance: N+1、不要なIO、メモリ、アルゴリズム計算量
  - Maintainability: 命名、責務分離、重複、コメント/ドキュメント、テスト容易性
  - API/UX: 互換性、破壊的変更、ログの可観測性（メトリクス/トレース）
- 指摘は「症状→原因→影響→推奨修正」で書く。曖昧な断定は禁止。

### 3. Fix (minimal, safe)
- 原則：**最小差分**・**局所性**・**後方互換**。
- 大規模リファクタやフォーマット一括変更は、明示依頼がない限りやらない。
- 既存パターン・既存規約（formatter/linter/型）に合わせる。
- 追加仕様が必要な場合は、複数案（Trade-off付き）で提示し、選べる形にする。

### 4. Tests (regression-first)
- バグ修正は原則 **再現テストを先に追加**し、修正で通す。
- テストが重い場合は、最小のユニットテストで原因を固定し、必要なら統合テストを追加。
- テスト追加が不可能/不適切な場合は、理由と代替（ログ、アサーション、型で保証）を明記。

### 5. Verify (prove it)
- 修正後に必ず再実行：
  - format / lint / typecheck / test / build（該当するもの）
- 実行できない場合は「なぜできないか」「代替の検証（静的推論）」を明記し、
  ユーザーが走らせるコマンドを提示する。

### 6. Deliver patch
- 差分は読みやすく：
  - 1つの問題に対して1コミット相当のまとまり（可能なら）
  - 変更理由が読み取れる命名・コメント
  - ログ/エラーメッセージは運用で役立つ粒度に（過剰なノイズは避ける）

---

## Severity rubric (use consistently)
- P0: セキュリティ事故/データ損失/サービス停止につながる
- P1: 主要機能不全、頻発クラッシュ、重大な互換性破壊
- P2: 一部機能不具合、エッジケース、運用負債が顕著
- P3: 可読性/保守性/軽微な性能、将来のバグ温床

---

## Guardrails
- 公開APIやDBスキーマの破壊的変更は、明示指示なしに実施しない。
- 依存関係アップデートは最小限（必要性・リスク・互換性を説明）。
- 機密情報（鍵、トークン、個人情報）をログ出力しない。
- 推測で仕様を作らない。仕様が不明なら「仮置き」として選択肢を出す。
- “動いているものを壊す”変更（広域リネーム、構造変更、無関係整理）は抑制する。

---

## Language/tooling hints (apply only if repo uses them)
### Python
- formatter: black / ruff format, lint: ruff, type: mypy/pyright, test: pytest
### JS/TS
- formatter: prettier, lint: eslint, type: tsc, test: jest/vitest
### Go
- gofmt/goimports, go test, golangci-lint
### Java/Kotlin
- mvn/gradle test, spotless/ktlint
### Rust
- cargo fmt, cargo clippy, cargo test

---

## Response template (use this structure)
### Conclusion
- （最重要な結論を1〜3行）

### Review findings
- P0:
- P1:
- P2:
- P3:

### Fix applied
- 変更点:
- 互換性:
- 影響範囲:

### Verification
- 実行コマンド:
- 結果:
- 残課題:

### Patch
- （diff / patch を貼る or ファイル単位で提示）

### Risks & follow-ups
- リスク:
- 追加でやると良いこと:
