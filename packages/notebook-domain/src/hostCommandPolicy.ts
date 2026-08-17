export type HostCommandDispatchState = "settled" | "pending";

export async function waitForHostCommandDispatch(
  hostCommand: Promise<unknown>,
): Promise<HostCommandDispatchState> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      hostCommand.then(() => "settled" as const),
      new Promise<"pending">((resolve) => {
        timer = setTimeout(() => resolve("pending"), 0);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
