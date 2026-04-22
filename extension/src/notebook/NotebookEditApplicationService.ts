import * as vscode from "vscode";
import {
  DeleteCellRequest,
  FormatCellRequest,
  FormatCellResult,
  InsertCellRequest,
  MoveCellRequest,
  MutationResult,
  PreviewCellEditRequest,
  PreviewCellEditResult,
  PatchCellSourceRequest,
  PatchCellSourceResult,
  ReplaceCellSourceRequest,
  ReplaceCellSourceResult,
} from "../../../packages/protocol/src";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookDocumentService } from "./NotebookDocumentService";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookMutationService } from "./NotebookMutationService";
import { CellPatchService } from "./CellPatchService";
import { NotebookLanguageService } from "./NotebookLanguageService";
import { computeSourceFingerprint } from "./cells";
import { buildUnifiedSourceDiff } from "./cellDiff";
import { summarizeSourceContract } from "./sourceContract";

export class NotebookEditApplicationService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly documentService: NotebookDocumentService,
    private readonly readService: NotebookReadService,
    private readonly mutationService: NotebookMutationService,
    private readonly cellPatchService: CellPatchService,
    private readonly languageService: NotebookLanguageService,
  ) {}

  public async insertCell(request: InsertCellRequest): Promise<MutationResult> {
    return this.withExclusiveDocument(request.notebook_uri, async (document) => {
      this.mutationService.assertExpectedVersion(
        this.registry.getVersion(request.notebook_uri),
        request.expected_notebook_version,
      );
      const outcome = await this.mutationService.insertCell(document, request);
      return this.toMutationResult(request.notebook_uri, outcome);
    });
  }

  public async replaceCellSource(request: ReplaceCellSourceRequest): Promise<ReplaceCellSourceResult> {
    return this.withExclusiveDocument(request.notebook_uri, async (document) => {
      const prepared = this.prepareCellEditPreview(document, {
        ...request,
        operation: "replace_cell_source",
      });
      const outcome = await this.mutationService.replaceCellSource(document, request);
      const mutation = this.toMutationResult(request.notebook_uri, outcome);
      return {
        ...mutation,
        operation: "replace_cell_source",
        ...summarizeSourceContract({
          beforeSource: prepared.currentSource,
          afterSource: prepared.proposedSource,
          beforeFingerprint: prepared.currentSourceFingerprint,
          afterFingerprint: computeSourceFingerprint(prepared.proposedSource),
          operation: "replace_cell_source",
        }),
      };
    });
  }

  public async previewCellEdit(request: PreviewCellEditRequest): Promise<PreviewCellEditResult> {
    return this.withExclusiveDocument(request.notebook_uri, async (document) => {
      const prepared = this.prepareCellEditPreview(document, request);
      return {
        notebook_uri: request.notebook_uri,
        notebook_version: this.registry.getVersion(request.notebook_uri),
        cell_id: request.cell_id,
        operation: request.operation,
        current_source: prepared.currentSource,
        proposed_source: prepared.proposedSource,
        diff_unified: buildUnifiedSourceDiff(prepared.currentSource, prepared.proposedSource),
        applied_patch_format: prepared.appliedPatchFormat,
        ...summarizeSourceContract({
          beforeSource: prepared.currentSource,
          afterSource: prepared.proposedSource,
          beforeFingerprint: prepared.currentSourceFingerprint,
          afterFingerprint: computeSourceFingerprint(prepared.proposedSource),
          operation: request.operation === "patch_cell_source" ? "preview_patch" : "preview_replace",
        }),
      };
    });
  }

  public async patchCellSource(request: PatchCellSourceRequest): Promise<PatchCellSourceResult> {
    return this.withExclusiveDocument(request.notebook_uri, async (document) => {
      const prepared = this.prepareCellEditPreview(document, {
        ...request,
        operation: "patch_cell_source",
      });
      const mutation =
        prepared.currentSource === prepared.proposedSource
          ? this.readService.toMutationResult(document, "patch_cell_source", [], [], false)
          : (() => {
              const outcome = this.mutationService.replaceCellSource(document, {
                notebook_uri: request.notebook_uri,
                cell_id: request.cell_id,
                source: prepared.proposedSource,
              });
              return outcome.then((resolved) =>
                this.readService.toMutationResult(
                  this.documentService.requireDocumentSync(request.notebook_uri),
                  "patch_cell_source",
                  resolved.changed_cell_ids,
                  resolved.deleted_cell_ids,
                  resolved.outline_maybe_changed,
                ),
              );
            })();

      return {
        ...(await mutation),
        operation: "patch_cell_source",
        applied_patch_format: prepared.appliedPatchFormat as PatchCellSourceResult["applied_patch_format"],
        applied_diff_unified: buildUnifiedSourceDiff(prepared.currentSource, prepared.proposedSource),
        ...summarizeSourceContract({
          beforeSource: prepared.currentSource,
          afterSource: prepared.proposedSource,
          beforeFingerprint: prepared.currentSourceFingerprint,
          afterFingerprint: computeSourceFingerprint(prepared.proposedSource),
          operation: "patch_cell_source",
        }),
      };
    });
  }

  public async formatCell(request: FormatCellRequest): Promise<FormatCellResult> {
    return this.withExclusiveDocument(request.notebook_uri, async (document) =>
      this.languageService.formatCell(document, request),
    );
  }

  public async deleteCell(request: DeleteCellRequest): Promise<MutationResult> {
    return this.withExclusiveDocument(request.notebook_uri, async (document) => {
      this.mutationService.assertExpectedVersion(
        this.registry.getVersion(request.notebook_uri),
        request.expected_notebook_version,
      );
      const outcome = await this.mutationService.deleteCell(document, request);
      return this.toMutationResult(request.notebook_uri, outcome);
    });
  }

  public async moveCell(request: MoveCellRequest): Promise<MutationResult> {
    return this.withExclusiveDocument(request.notebook_uri, async (document) => {
      this.mutationService.assertExpectedVersion(
        this.registry.getVersion(request.notebook_uri),
        request.expected_notebook_version,
      );
      const outcome = await this.mutationService.moveCell(document, request);
      return this.toMutationResult(request.notebook_uri, outcome);
    });
  }

  private async withExclusiveDocument<T>(
    notebookUri: string,
    operation: (document: vscode.NotebookDocument) => Promise<T>,
  ): Promise<T> {
    return this.registry.runExclusive(notebookUri, async () => {
      const document = await this.documentService.requireReadyDocument(notebookUri);
      return operation(document);
    });
  }

  private toMutationResult(
    notebookUri: string,
    outcome: {
      operation: MutationResult["operation"];
      changed_cell_ids: readonly string[];
      deleted_cell_ids: readonly string[];
      outline_maybe_changed: boolean;
    },
  ): MutationResult {
    return this.readService.toMutationResult(
      this.documentService.requireDocumentSync(notebookUri),
      outcome.operation,
      outcome.changed_cell_ids,
      outcome.deleted_cell_ids,
      outcome.outline_maybe_changed,
    );
  }

  private assertEditGuards(
    document: vscode.NotebookDocument,
    request: {
      notebook_uri: string;
      cell_id: string;
      expected_notebook_version?: number;
      expected_cell_source_fingerprint?: string;
    },
    allowFingerprintToBypassVersion: boolean,
  ): void {
    const currentVersion = this.registry.getVersion(request.notebook_uri);
    this.readService.assertExpectedCellSources(
      document,
      request.expected_cell_source_fingerprint
        ? {
            [request.cell_id]: request.expected_cell_source_fingerprint,
          }
        : undefined,
      [request.cell_id],
    );

    if (allowFingerprintToBypassVersion && request.expected_cell_source_fingerprint) {
      return;
    }

    this.mutationService.assertExpectedVersion(currentVersion, request.expected_notebook_version);
  }

  private prepareCellEditPreview(
    document: vscode.NotebookDocument,
    request: PreviewCellEditRequest,
  ): {
    currentSource: string;
    proposedSource: string;
    currentSourceFingerprint: string;
    appliedPatchFormat?: PatchCellSourceResult["applied_patch_format"];
  } {
    this.assertEditGuards(document, request, request.operation === "patch_cell_source");
    const cell = this.readService.requireCell(document, request.cell_id);
    const currentSource = cell.document.getText();
    const currentSourceFingerprint = computeSourceFingerprint(currentSource);

    if (request.operation === "replace_cell_source") {
      return {
        currentSource,
        proposedSource: request.source,
        currentSourceFingerprint,
      };
    }

    const patchResult = this.cellPatchService.applyPatch(currentSource, request.patch, request.format);
    return {
      currentSource,
      proposedSource: patchResult.updatedSource,
      currentSourceFingerprint,
      appliedPatchFormat: patchResult.format,
    };
  }
}
