# Release Notes

## 2026-02-24
- コースIDの採番を `C001` 形式の連番へ統一。
  - `updateMasterData` の `type === 'course'` の新規作成は、`SheetHelper.insertData(..., 'C')` 経由のみで採番。
  - 既存ID指定での新規作成流用は不可（更新用途のみ）。
- 旧採番関数 `generateRowId_`（`prefix + yyyyMMddHHmmss + random`）は非推奨化し、新規利用を禁止。
