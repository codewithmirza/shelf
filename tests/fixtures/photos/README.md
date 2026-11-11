# Photo fixtures

`answers/` holds model answers shaped like Vertex `generateContent` responses. They were written by hand from the
Gate 5 schema, not recorded from a live call. Replace them with recorded answers when S-03 is done.

For the live run (SPK-04, TC-AI-01 live), put five product photos here as `1.jpg` to `5.jpg` and run:

```
SHELF_LIVE_VERTEX=1 CF_ACCOUNT_ID=… AIG_NAME=shelf CF_AIG_TOKEN=… GCP_PROJECT=… pnpm vitest run tests/contract/extraction.test.ts
```
