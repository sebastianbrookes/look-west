// Use fake timers to prevent convex-test's scheduled function callbacks
// (setTimeout) from firing. The callbacks cause spurious "Write outside
// of transaction" unhandled rejections — a known convex-test limitation.
import { vi } from "vitest";
vi.useFakeTimers();
