# PHÁT TÀI POS v1.5.5 / 2.6.0-phattai.7

Cross-flow stability update.

Changes:
- MANAGER now receives `CATALOG_MANAGE` and can access `Món & giá / 菜品与价格`.
- Correct cancellation-ticket printing semantics: cancelled order exposes only `CANCEL` kitchen jobs; stale `NEW/ADD` jobs cannot reprint.
- Added 79 cross-flow tests; total automated suite is 255 tests.
- No destructive database change. New migration `0016_manager_catalog_permission.sql` only updates MANAGER permissions.

Cloudflare deploy command remains:

```text
npm run deploy:remote
```

The deploy script applies pending migration 0016 automatically before deploying the Worker.
