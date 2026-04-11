export interface ExecutionProgressObservation {
  cell_id: string;
  changed_from_baseline: boolean;
  failed: boolean;
}

export interface ExecutionProgressState {
  pending_cell_ids: string[];
  skipped_cell_ids: string[];
}

export function deriveExecutionProgressState(
  observations: readonly ExecutionProgressObservation[],
  stopOnError: boolean,
): ExecutionProgressState {
  const pending = new Set(observations.map((observation) => observation.cell_id));
  const skipped = new Set<string>();
  let firstFailureIndex: number | undefined;

  observations.forEach((observation, index) => {
    if (observation.changed_from_baseline) {
      pending.delete(observation.cell_id);
    }

    if (stopOnError && firstFailureIndex === undefined && observation.failed) {
      firstFailureIndex = index;
    }
  });

  if (stopOnError && firstFailureIndex !== undefined) {
    observations.slice(firstFailureIndex + 1).forEach((observation) => {
      if (observation.changed_from_baseline) {
        return;
      }

      pending.delete(observation.cell_id);
      skipped.add(observation.cell_id);
    });
  }

  return {
    pending_cell_ids: [...pending],
    skipped_cell_ids: [...skipped],
  };
}
