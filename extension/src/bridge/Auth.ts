import { timingSafeEqual } from "node:crypto";
import { fail } from "../../../packages/protocol/src";

export class BearerTokenAuth {
  public constructor(private readonly token: string) {}

  public assertAuthorized(header: string | undefined): void {
    if (!header || !header.startsWith("Bearer ")) {
      fail({
        code: "AuthenticationFailed",
        message: "Missing bearer token.",
        recoverable: true,
      });
    }

    const provided = header.slice("Bearer ".length);
    if (!constantTimeEquals(provided, this.token)) {
      fail({
        code: "AuthenticationFailed",
        message: "Bearer token is invalid.",
        recoverable: true,
      });
    }
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
