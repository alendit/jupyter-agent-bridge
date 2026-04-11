import { RevealNotebookCellsRequest, fail } from "../../../packages/protocol/src";

interface RevealPresentationCell {
  index: number;
  outputs: readonly unknown[];
}

export interface RevealPresentationPlan {
  focusTarget: "cell" | "output";
  focusCellIndex: number | null;
}

export function planRevealPresentation(
  request: RevealNotebookCellsRequest,
  cells: readonly RevealPresentationCell[],
): RevealPresentationPlan {
  const focusTarget = request.focus_target ?? "cell";

  if (focusTarget === "output") {
    const focusCell = cells.find((cell) => cell.outputs.length > 0);
    if (!focusCell) {
      fail({
        code: "CellOutputNotFound",
        message: "The reveal target did not include a cell with output.",
        recoverable: true,
      });
    }

    return {
      focusTarget,
      focusCellIndex: focusCell.index,
    };
  }

  return {
    focusTarget,
    focusCellIndex: null,
  };
}
