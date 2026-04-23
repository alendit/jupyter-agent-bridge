import * as vscode from "vscode";
import {
  FindSymbolsRequest,
  FindSymbolsResult,
  GetNotebookEditorStateRequest,
  GetNotebookEditorStateResult,
  GetKernelInfoResult,
  GoToDefinitionRequest,
  GoToDefinitionResult,
  ListNotebookCellsRequest,
  ListNotebookCellsResult,
  ListNotebookVariablesRequest,
  ListNotebookVariablesResult,
  ListOpenNotebooksResult,
  NotebookDiagnosticsRequest,
  NotebookDiagnosticsResult,
  NotebookOutlineResult,
  OpenNotebookRequest,
  OpenNotebookResult,
  ReadCellOutputsRequest,
  ReadCellOutputsResult,
  ReadNotebookRequest,
  ReadNotebookResult,
  RevealNotebookCellsRequest,
  RevealNotebookCellsResult,
  SetNotebookCellInputVisibilityRequest,
  SetNotebookCellInputVisibilityResult,
  SearchNotebookRequest,
  SearchNotebookResult,
  SummarizeNotebookStateResult,
  fail,
} from "../../../packages/protocol/src";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookDocumentService } from "./NotebookDocumentService";
import { NotebookReadService } from "./NotebookReadService";
import { NotebookSearchService } from "./NotebookSearchService";
import { NotebookLanguageService } from "./NotebookLanguageService";
import { NotebookVariableService } from "./NotebookVariableService";
import { HostKernelObservationService } from "./HostKernelObservationService";
import { NotebookCommandAdapter } from "../commands/NotebookCommandAdapter";
import { selectNotebookCells } from "./cellSelection";
import { getStoredCellId } from "./cells";
import { planRevealPresentation } from "./revealPresentation";

export class NotebookQueryApplicationService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly documentService: NotebookDocumentService,
    private readonly readService: NotebookReadService,
    private readonly searchService: NotebookSearchService,
    private readonly languageService: NotebookLanguageService,
    private readonly variableService: NotebookVariableService,
    private readonly hostKernelObservationService: HostKernelObservationService,
    private readonly commandAdapter: NotebookCommandAdapter,
  ) {}

  public async listOpenNotebooks(): Promise<ListOpenNotebooksResult> {
    const documents = this.registry.listDocuments().filter((document) => document.notebookType === "jupyter-notebook");
    return this.readService.listOpenNotebooks(documents);
  }

  public async openNotebook(request: OpenNotebookRequest): Promise<OpenNotebookResult> {
    const document = await this.documentService.openNotebook(request);
    return this.readService.toNotebookSummary(document);
  }

  public async getNotebookOutline(notebookUri: string): Promise<NotebookOutlineResult> {
    const document = await this.documentService.requireReadyDocument(notebookUri);
    return this.readService.getNotebookOutline(document);
  }

  public async listNotebookCells(request: ListNotebookCellsRequest): Promise<ListNotebookCellsResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    return this.readService.listNotebookCells(document, request);
  }

  public async listVariables(request: ListNotebookVariablesRequest): Promise<ListNotebookVariablesResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    return this.variableService.listVariables(document, request);
  }

  public async searchNotebook(request: SearchNotebookRequest): Promise<SearchNotebookResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    return this.searchService.search(document, request);
  }

  public async getDiagnostics(request: NotebookDiagnosticsRequest): Promise<NotebookDiagnosticsResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    return this.languageService.getDiagnostics(document, request);
  }

  public async findSymbols(request: FindSymbolsRequest): Promise<FindSymbolsResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    return this.languageService.findSymbols(document, request);
  }

  public async goToDefinition(request: GoToDefinitionRequest): Promise<GoToDefinitionResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    return this.languageService.goToDefinition(document, request);
  }

  public async readNotebook(request: ReadNotebookRequest): Promise<ReadNotebookResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    return this.readService.readNotebook(document, request);
  }

  public async readCellOutputs(request: ReadCellOutputsRequest): Promise<ReadCellOutputsResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    const cell = this.readService.requireCell(document, request.cell_id);
    return this.readService.readCellOutputs(document, cell, request.include_rich_output_text ?? false);
  }

  public async revealCells(request: RevealNotebookCellsRequest): Promise<RevealNotebookCellsResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    const cells = selectNotebookCells(document, {
      range: request.range,
      cell_ids: request.cell_ids,
    });
    if (cells.length === 0) {
      fail({
        code: "CellNotFound",
        message: "No notebook cells matched the reveal request.",
        recoverable: true,
      });
    }

    const ranges = cells.map((cell) => new vscode.NotebookRange(cell.index, cell.index + 1));
    const presentation = planRevealPresentation(request, cells);

    let editor = await this.commandAdapter.revealCells(document, ranges, {
      select: request.select ?? true,
      revealType: toRevealType(request.reveal_type),
    });

    if (presentation.focusCellIndex !== null) {
      editor = await this.commandAdapter.focusCellOutput(
        document,
        new vscode.NotebookRange(presentation.focusCellIndex, presentation.focusCellIndex + 1),
        ranges,
      );
    }

    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      revealed_cell_ids: cells.map((cell) => getStoredCellId(cell) ?? "").filter((cellId) => cellId.length > 0),
      selected: request.select ?? true,
      focused_target: presentation.focusTarget,
      visible_ranges: editor.visibleRanges.map((range) => ({ start: range.start, end: range.end })),
    };
  }

  public async setCellInputVisibility(
    request: SetNotebookCellInputVisibilityRequest,
  ): Promise<SetNotebookCellInputVisibilityResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    const cells = selectNotebookCells(document, {
      range: request.range,
      cell_ids: request.cell_ids,
    });
    if (cells.length === 0) {
      fail({
        code: "CellNotFound",
        message: "No notebook cells matched the input visibility request.",
        recoverable: true,
      });
    }

    const ranges = cells.map((cell) => new vscode.NotebookRange(cell.index, cell.index + 1));
    await this.commandAdapter.setCellInputVisibility(document, ranges, request.input_visibility);
    return {
      notebook_uri: document.uri.toString(),
      notebook_version: this.registry.getVersion(document.uri.toString()),
      updated_cell_ids: cells.map((cell) => getStoredCellId(cell) ?? "").filter((cellId) => cellId.length > 0),
      input_visibility: request.input_visibility,
    };
  }

  public async getKernelInfo(notebookUri: string): Promise<GetKernelInfoResult> {
    const document = await this.documentService.requireReadyDocument(notebookUri);
    await this.hostKernelObservationService.refresh(document);
    return this.readService.getKernelInfo(document);
  }

  public async summarizeNotebookState(notebookUri: string): Promise<SummarizeNotebookStateResult> {
    const document = await this.documentService.requireReadyDocument(notebookUri);
    await this.hostKernelObservationService.refresh(document);
    return this.readService.summarizeNotebookState(document);
  }

  public async getNotebookEditorState(
    request: GetNotebookEditorStateRequest,
  ): Promise<GetNotebookEditorStateResult> {
    const document = request.notebook_uri
      ? await this.documentService.requireReadyDocument(request.notebook_uri)
      : this.registry.getActiveNotebookDocument();
    if (!document) {
      fail({
        code: "NotebookNotFound",
        message: "No active notebook editor is available. Provide notebook_uri to inspect a specific notebook.",
        recoverable: true,
      });
    }

    return this.registry.getNotebookEditorState(document);
  }
}

function toRevealType(
  value: RevealNotebookCellsRequest["reveal_type"],
): vscode.NotebookEditorRevealType {
  switch (value) {
    case "center":
      return vscode.NotebookEditorRevealType.InCenter;
    case "center_if_outside_viewport":
      return vscode.NotebookEditorRevealType.InCenterIfOutsideViewport;
    case "top":
      return vscode.NotebookEditorRevealType.AtTop;
    case "default":
    case undefined:
      return vscode.NotebookEditorRevealType.Default;
  }
}
