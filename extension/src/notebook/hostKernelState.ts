import { KernelState } from "../../../packages/protocol/src";

export interface HostKernelObservation {
  state: KernelState;
  last_seen_at_ms: number;
  source: "jupyter-api";
}

export function mapHostKernelStatus(status: string | null | undefined): KernelState {
  switch (status) {
    case "idle":
      return "idle";
    case "busy":
      return "busy";
    case "starting":
      return "starting";
    case "restarting":
    case "autorestarting":
      return "restarting";
    case "dead":
    case "terminating":
      return "disconnected";
    default:
      return "unknown";
  }
}
