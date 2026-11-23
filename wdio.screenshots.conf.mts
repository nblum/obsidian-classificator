import { createObsidianConfig } from "./wdio.conf.mts";

export const config = createObsidianConfig(
  ["./tests/e2e/documentation.capture.ts"], "tests/e2e/documentation-vault", "1.15.1", 120_000,
);
