import { parseLog } from "./model/parseLog.js";

// Dedicated worker: parse the (potentially huge) git log off the main thread so the
// UI never blocks. Typed loosely to avoid pulling in the WebWorker lib (spec §9).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(msg: unknown): void;
};

ctx.onmessage = (e: MessageEvent) => {
  const { id, log } = e.data as { id: number; log: string };
  const { commits } = parseLog(log);
  ctx.postMessage({ id, commits });
};
