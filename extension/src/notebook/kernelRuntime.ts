import { KernelPendingAction, KernelState } from "../../../packages/protocol/src";
import { ParsedNotebookKernelMetadata } from "./kernelMetadata";

export interface NotebookKernelRuntimeState {
  generation: number;
  state: KernelState;
  pending_action: KernelPendingAction;
  requires_user_interaction: boolean;
  last_seen_at_ms: number | null;
  kernel_signature: string | null;
}

const INTERACTIVE_PENDING_ACTION_TTL_MS = 5_000;

export function createInitialKernelRuntimeState(
  metadata: ParsedNotebookKernelMetadata,
  now = Date.now(),
): NotebookKernelRuntimeState {
  return {
    generation: 1,
    state: metadata.execution_supported && metadata.has_kernel ? "idle" : "unknown",
    pending_action: null,
    requires_user_interaction: false,
    last_seen_at_ms: metadata.has_kernel ? now : null,
    kernel_signature: metadata.signature,
  };
}

export function reconcileKernelRuntimeState(
  current: NotebookKernelRuntimeState,
  metadata: ParsedNotebookKernelMetadata,
  options?: {
    now?: number;
    observed_execution_state?: "busy" | "idle" | null;
  },
): NotebookKernelRuntimeState {
  const now = options?.now ?? Date.now();
  const observedExecutionState = options?.observed_execution_state ?? null;
  const next: NotebookKernelRuntimeState = { ...current };

  if (metadata.signature !== current.kernel_signature) {
    next.generation += 1;
    next.kernel_signature = metadata.signature;
    next.pending_action = null;
    next.requires_user_interaction = false;
    next.state =
      metadata.execution_supported && metadata.has_kernel ? observedExecutionState ?? "idle" : "unknown";
    next.last_seen_at_ms = metadata.has_kernel ? now : null;
    return next;
  }

  if (
    next.requires_user_interaction &&
    (next.pending_action === "select_kernel" || next.pending_action === "select_interpreter") &&
    next.last_seen_at_ms !== null &&
    now - next.last_seen_at_ms >= INTERACTIVE_PENDING_ACTION_TTL_MS
  ) {
    next.pending_action = null;
    next.requires_user_interaction = false;
    next.state = metadata.execution_supported && metadata.has_kernel ? observedExecutionState ?? "idle" : "unknown";
    next.last_seen_at_ms = metadata.has_kernel ? now : null;
  }

  if (observedExecutionState) {
    next.state = observedExecutionState;
    next.pending_action = null;
    next.requires_user_interaction = false;
    next.last_seen_at_ms = now;
    return next;
  }

  if (metadata.execution_supported && metadata.has_kernel && next.pending_action === null && next.state === "unknown") {
    next.state = "idle";
    next.last_seen_at_ms = now;
  }

  if (!metadata.has_kernel && next.pending_action === null) {
    next.state = "unknown";
    next.last_seen_at_ms = null;
  }

  return next;
}

export function markKernelCommandRequested(
  current: NotebookKernelRuntimeState,
  action: Exclude<KernelPendingAction, null>,
  options?: {
    now?: number;
    requires_user_interaction?: boolean;
    bump_generation?: boolean;
  },
): NotebookKernelRuntimeState {
  const now = options?.now ?? Date.now();
  const bumpGeneration = options?.bump_generation ?? false;
  const stateByAction: Record<Exclude<KernelPendingAction, null>, KernelState> = {
    restart: "restarting",
    interrupt: "interrupting",
    select_kernel: "selecting",
    select_interpreter: "selecting",
  };

  return {
    ...current,
    generation: current.generation + (bumpGeneration ? 1 : 0),
    state: stateByAction[action],
    pending_action: action,
    requires_user_interaction: options?.requires_user_interaction ?? false,
    last_seen_at_ms: now,
  };
}

export function markKernelExecutionStarted(
  current: NotebookKernelRuntimeState,
  now = Date.now(),
): NotebookKernelRuntimeState {
  return {
    ...current,
    state: "busy",
    pending_action: null,
    requires_user_interaction: false,
    last_seen_at_ms: now,
  };
}

export function markKernelExecutionCompleted(
  current: NotebookKernelRuntimeState,
  now = Date.now(),
): NotebookKernelRuntimeState {
  return {
    ...current,
    state: "idle",
    pending_action: null,
    requires_user_interaction: false,
    last_seen_at_ms: now,
  };
}

export function isKernelReady(
  kernel: {
    execution_supported: boolean;
    kernel_id: string | null;
    kernel_label: string | null;
    generation: number;
    state: KernelState;
    pending_action: KernelPendingAction;
    requires_user_interaction: boolean;
  } | null,
  targetGeneration: number,
): boolean {
  if (!kernel || !kernel.execution_supported) {
    return false;
  }

  const hasKernelIdentity = kernel.kernel_id !== null || kernel.kernel_label !== null;

  if (kernel.requires_user_interaction || kernel.generation < targetGeneration) {
    return false;
  }

  if (kernel.state === "idle" && hasKernelIdentity) {
    return true;
  }

  return (
    kernel.state === "unknown" &&
    kernel.pending_action === null &&
    hasKernelIdentity
  );
}
