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
} from "../../../packages/protocol/src";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookDocumentService } from "./NotebookDocumentService";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookMutationService } from "./NotebookMutationService";
import { CellPatchService } from "./CellPatchService";
import { NotebookLanguageService } from "./NotebookLanguageService";
import { computeSourceFingerprint } from "./cells";
import { buildUnifiedSourceDiff } from "./cellDiff";

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

  public async replaceCellSource(request: ReplaceCellSourceRequest): Promise<MutationResult> {
    return this.withExclusiveDocument(request.notebook_uri, async (document) => {
      this.assertEditGuards(document, request, false);
      const outcome = await this.mutationService.replaceCellSource(document, request);
      return this.toMutationResult(request.notebook_uri, outcome);
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
        before_source_fingerprint: prepared.currentSourceFingerprint,
        after_source_fingerprint: computeSourceFingerprint(prepared.proposedSource),
        diff_unified: buildUnifiedSourceDiff(prepared.currentSource, prepared.proposedSource),
        applied_patch_format: prepared.appliedPatchFormat,
      };
    });
  }

  public async patchCellSource(request: PatchCellSourceRequest): Promise<PatchCellSourceResult> {
    return this.withExclusiveDocument(request.notebook_uri, async (document) => {
      const prepared = this.prepareCellEditPreview(document, {
        ...request,
        operation: "patch_cell_source",
      });
      const outcome = await this.mutationService.replaceCellSource(document, {
        notebook_uri: request.notebook_uri,
        cell_id: request.cell_id,
        source: prepared.proposedSource,
      });
      const mutation = this.readService.toMutationResult(
        this.documentService.requireDocumentSync(request.notebook_uri),
        "patch_cell_source",
        outcome.changed_cell_ids,
        outcome.deleted_cell_ids,
        outcome.outline_maybe_changed,
      );

      return {
        ...mutation,
        operation: "patch_cell_source",
        applied_patch_format: prepared.appliedPatchFormat as PatchCellSourceResult["applied_patch_format"],
        before_source_fingerprint: prepared.currentSourceFingerprint,
        after_source_fingerprint: computeSourceFingerprint(prepared.proposedSource),
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
