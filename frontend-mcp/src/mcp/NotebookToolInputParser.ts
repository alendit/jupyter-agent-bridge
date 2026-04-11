import {
  DeleteCellRequest,
  ExecuteCellsAsyncRequest,
  ExecuteCellsRequest,
  FindSymbolsRequest,
  FormatCellRequest,
  GetExecutionStatusRequest,
  GoToDefinitionRequest,
  InsertCellRequest,
  ListNotebookCellsRequest,
  ListNotebookVariablesRequest,
  MoveCellRequest,
  NotebookDiagnosticsRequest,
  OpenNotebookRequest,
  PatchCellSourceRequest,
  ReplaceCellSourceRequest,
  RevealNotebookCellsRequest,
  SearchNotebookRequest,
  SelectKernelRequest,
  WaitForExecutionRequest,
  WaitForKernelReadyRequest,
} from "../../../packages/protocol/src";
import {
  ReadCellOutputsToolRequest,
  ReadNotebookToolRequest,
  TOOL_NAMES,
  ToolName,
} from "./NotebookToolCatalog";

type ToolInput = Record<string, unknown>;
type NotebookCellInput = InsertCellRequest["cell"];

export class NotebookToolInputParser {
  public parseEmptyInput(toolName: ToolName, input: unknown): void {
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, []);
  }

  public parseDescribeToolInput(input: unknown): { tool_name?: ToolName } {
    const toolName = "describe_tool";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["tool_name"]);

    const candidate = params.tool_name;
    if (candidate === undefined) {
      return {};
    }

    return {
      tool_name: this.parseEnum(candidate, `${toolName}.tool_name`, TOOL_NAMES),
    };
  }

  public parseOpenNotebookRequest(input: unknown): OpenNotebookRequest {
    const toolName = "open_notebook";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "view_column"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      view_column:
        params.view_column === undefined
          ? undefined
          : this.parseEnum(params.view_column, `${toolName}.view_column`, ["active", "beside"]),
    };
  }

  public parseReadNotebookRequest(input: unknown): ReadNotebookToolRequest {
    const toolName = "read_notebook";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "include_outputs",
      "include_rich_output_text",
      "output_file_path",
      "range",
      "cell_ids",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      include_outputs:
        params.include_outputs === undefined
          ? undefined
          : this.requiredBoolean(params.include_outputs, `${toolName}.include_outputs`),
      include_rich_output_text:
        params.include_rich_output_text === undefined
          ? undefined
          : this.requiredBoolean(params.include_rich_output_text, `${toolName}.include_rich_output_text`),
      output_file_path:
        params.output_file_path === undefined
          ? undefined
          : this.requiredString(params.output_file_path, `${toolName}.output_file_path`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids:
        params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
    };
  }

  public parseListNotebookCellsRequest(input: unknown): ListNotebookCellsRequest {
    const toolName = "list_notebook_cells";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "range", "cell_ids"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids:
        params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
    };
  }

  public parseListVariablesRequest(input: unknown): ListNotebookVariablesRequest {
    const toolName = "list_variables";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "query", "offset", "max_results"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      query: params.query === undefined ? undefined : this.requiredString(params.query, `${toolName}.query`),
      offset: params.offset === undefined ? undefined : this.requiredNonNegativeInteger(params.offset, `${toolName}.offset`),
      max_results:
        params.max_results === undefined
          ? undefined
          : this.requiredPositiveInteger(params.max_results, `${toolName}.max_results`),
    };
  }

  public parseSearchNotebookRequest(input: unknown): SearchNotebookRequest {
    const toolName = "search_notebook";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "query",
      "case_sensitive",
      "regex",
      "whole_word",
      "max_results",
      "range",
      "cell_ids",
      "cell_kind",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      query: this.requiredString(params.query, `${toolName}.query`),
      case_sensitive:
        params.case_sensitive === undefined
          ? undefined
          : this.requiredBoolean(params.case_sensitive, `${toolName}.case_sensitive`),
      regex: params.regex === undefined ? undefined : this.requiredBoolean(params.regex, `${toolName}.regex`),
      whole_word:
        params.whole_word === undefined ? undefined : this.requiredBoolean(params.whole_word, `${toolName}.whole_word`),
      max_results:
        params.max_results === undefined
          ? undefined
          : this.requiredPositiveInteger(params.max_results, `${toolName}.max_results`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids:
        params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
      cell_kind:
        params.cell_kind === undefined
          ? undefined
          : this.parseEnum(params.cell_kind, `${toolName}.cell_kind`, ["code", "markdown"]),
    };
  }

  public parseFindSymbolsRequest(input: unknown): FindSymbolsRequest {
    const toolName = "find_symbols";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "query", "max_results", "range", "cell_ids"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      query: params.query === undefined ? undefined : this.requiredString(params.query, `${toolName}.query`),
      max_results:
        params.max_results === undefined
          ? undefined
          : this.requiredPositiveInteger(params.max_results, `${toolName}.max_results`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids:
        params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
    };
  }

  public parseGetDiagnosticsRequest(input: unknown): NotebookDiagnosticsRequest {
    const toolName = "get_diagnostics";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "severities", "max_results", "range", "cell_ids"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      severities:
        params.severities === undefined
          ? undefined
          : this.requiredEnumArray(params.severities, `${toolName}.severities`, [
              "error",
              "warning",
              "information",
              "hint",
            ]),
      max_results:
        params.max_results === undefined
          ? undefined
          : this.requiredPositiveInteger(params.max_results, `${toolName}.max_results`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids:
        params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
    };
  }

  public parseGoToDefinitionRequest(input: unknown): GoToDefinitionRequest {
    const toolName = "go_to_definition";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "cell_id",
      "line",
      "column",
      "expected_cell_source_fingerprint",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      line: this.requiredPositiveInteger(params.line, `${toolName}.line`),
      column: this.requiredPositiveInteger(params.column, `${toolName}.column`),
      expected_cell_source_fingerprint:
        params.expected_cell_source_fingerprint === undefined
          ? undefined
          : this.requiredString(
              params.expected_cell_source_fingerprint,
              `${toolName}.expected_cell_source_fingerprint`,
            ),
    };
  }

  public normalizeInsertCellRequest(input: unknown): InsertCellRequest {
    const toolName = "insert_cell";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "expected_notebook_version", "position", "cell"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      position: this.normalizeInsertCellPosition(this.requireObject(params.position, toolName, "position")),
      cell: this.parseCell(toolName, params.cell),
    };
  }

  public parseReplaceCellSourceRequest(input: unknown): ReplaceCellSourceRequest {
    const toolName = "replace_cell_source";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "cell_id",
      "expected_notebook_version",
      "expected_cell_source_fingerprint",
      "source",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      expected_cell_source_fingerprint:
        params.expected_cell_source_fingerprint === undefined
          ? undefined
          : this.requiredString(
              params.expected_cell_source_fingerprint,
              `${toolName}.expected_cell_source_fingerprint`,
            ),
      source: this.requiredString(params.source, `${toolName}.source`),
    };
  }

  public parsePatchCellSourceRequest(input: unknown): PatchCellSourceRequest {
    const toolName = "patch_cell_source";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "cell_id",
      "patch",
      "format",
      "expected_notebook_version",
      "expected_cell_source_fingerprint",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      patch: this.requiredString(params.patch, `${toolName}.patch`),
      format:
        params.format === undefined
          ? undefined
          : this.parseEnum(params.format, `${toolName}.format`, [
              "auto",
              "unified_diff",
              "codex_apply_patch",
              "search_replace_json",
            ]),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      expected_cell_source_fingerprint:
        params.expected_cell_source_fingerprint === undefined
          ? undefined
          : this.requiredString(
              params.expected_cell_source_fingerprint,
              `${toolName}.expected_cell_source_fingerprint`,
            ),
    };
  }

  public parseFormatCellRequest(input: unknown): FormatCellRequest {
    const toolName = "format_cell";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "cell_id",
      "expected_notebook_version",
      "expected_cell_source_fingerprint",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      expected_cell_source_fingerprint:
        params.expected_cell_source_fingerprint === undefined
          ? undefined
          : this.requiredString(
              params.expected_cell_source_fingerprint,
              `${toolName}.expected_cell_source_fingerprint`,
            ),
    };
  }

  public parseDeleteCellRequest(input: unknown): DeleteCellRequest {
    const toolName = "delete_cell";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "cell_id", "expected_notebook_version"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
    };
  }

  public parseMoveCellRequest(input: unknown): MoveCellRequest {
    const toolName = "move_cell";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "cell_id", "expected_notebook_version", "target_index"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      target_index: this.requiredNonNegativeInteger(params.target_index, `${toolName}.target_index`),
    };
  }

  public parseExecuteCellsRequest(input: unknown): ExecuteCellsRequest {
    const toolName = "execute_cells";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "cell_ids",
      "expected_notebook_version",
      "expected_cell_source_fingerprint_by_id",
      "timeout_ms",
      "stop_on_error",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_ids: this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      expected_cell_source_fingerprint_by_id:
        params.expected_cell_source_fingerprint_by_id === undefined
          ? undefined
          : this.requiredStringRecord(
              params.expected_cell_source_fingerprint_by_id,
              `${toolName}.expected_cell_source_fingerprint_by_id`,
            ),
      timeout_ms:
        params.timeout_ms === undefined
          ? undefined
          : this.requiredPositiveInteger(params.timeout_ms, `${toolName}.timeout_ms`),
      stop_on_error:
        params.stop_on_error === undefined
          ? undefined
          : this.requiredBoolean(params.stop_on_error, `${toolName}.stop_on_error`),
    };
  }

  public parseExecuteCellsAsyncRequest(input: unknown): ExecuteCellsAsyncRequest {
    const toolName = "execute_cells_async";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, [
      "notebook_uri",
      "cell_ids",
      "expected_notebook_version",
      "expected_cell_source_fingerprint_by_id",
      "timeout_ms",
      "stop_on_error",
    ]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_ids: this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
      expected_notebook_version:
        params.expected_notebook_version === undefined
          ? undefined
          : this.requiredInteger(params.expected_notebook_version, `${toolName}.expected_notebook_version`),
      expected_cell_source_fingerprint_by_id:
        params.expected_cell_source_fingerprint_by_id === undefined
          ? undefined
          : this.requiredStringRecord(
              params.expected_cell_source_fingerprint_by_id,
              `${toolName}.expected_cell_source_fingerprint_by_id`,
            ),
      timeout_ms:
        params.timeout_ms === undefined
          ? undefined
          : this.requiredPositiveInteger(params.timeout_ms, `${toolName}.timeout_ms`),
      stop_on_error:
        params.stop_on_error === undefined
          ? undefined
          : this.requiredBoolean(params.stop_on_error, `${toolName}.stop_on_error`),
    };
  }

  public parseSelectKernelRequest(input: unknown): SelectKernelRequest {
    const toolName = "select_kernel";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "kernel_id", "extension_id", "skip_if_already_selected"]);

    const kernelId =
      params.kernel_id === undefined ? undefined : this.requiredString(params.kernel_id, `${toolName}.kernel_id`);
    const extensionId =
      params.extension_id === undefined ? undefined : this.requiredString(params.extension_id, `${toolName}.extension_id`);

    if ((kernelId && !extensionId) || (!kernelId && extensionId)) {
      this.failValidation(toolName, "kernel_id and extension_id must be provided together for direct kernel selection.");
    }

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      kernel_id: kernelId,
      extension_id: extensionId,
      skip_if_already_selected:
        params.skip_if_already_selected === undefined
          ? undefined
          : this.requiredBoolean(params.skip_if_already_selected, `${toolName}.skip_if_already_selected`),
    };
  }

  public parseWaitForKernelReadyRequest(input: unknown): WaitForKernelReadyRequest {
    const toolName = "wait_for_kernel_ready";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "timeout_ms", "target_generation"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      timeout_ms:
        params.timeout_ms === undefined
          ? undefined
          : this.requiredPositiveInteger(params.timeout_ms, `${toolName}.timeout_ms`),
      target_generation:
        params.target_generation === undefined
          ? undefined
          : this.requiredNonNegativeInteger(params.target_generation, `${toolName}.target_generation`),
    };
  }

  public parseGetExecutionStatusRequest(input: unknown): GetExecutionStatusRequest {
    const toolName = "get_execution_status";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["execution_id"]);

    return {
      execution_id: this.requiredString(params.execution_id, `${toolName}.execution_id`),
    };
  }

  public parseWaitForExecutionRequest(input: unknown): WaitForExecutionRequest {
    const toolName = "wait_for_execution";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["execution_id", "timeout_ms"]);

    return {
      execution_id: this.requiredString(params.execution_id, `${toolName}.execution_id`),
      timeout_ms:
        params.timeout_ms === undefined
          ? undefined
          : this.requiredPositiveInteger(params.timeout_ms, `${toolName}.timeout_ms`),
    };
  }

  public parseReadCellOutputsRequest(input: unknown): ReadCellOutputsToolRequest {
    const toolName = "read_cell_outputs";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "cell_id", "include_rich_output_text", "output_file_path"]);

    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      cell_id: this.requiredString(params.cell_id, `${toolName}.cell_id`),
      include_rich_output_text:
        params.include_rich_output_text === undefined
          ? undefined
          : this.requiredBoolean(params.include_rich_output_text, `${toolName}.include_rich_output_text`),
      output_file_path:
        params.output_file_path === undefined
          ? undefined
          : this.requiredString(params.output_file_path, `${toolName}.output_file_path`),
    };
  }

  public parseRevealNotebookCellsRequest(input: unknown): RevealNotebookCellsRequest {
    const toolName = "reveal_notebook_cells";
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri", "range", "cell_ids", "select", "reveal_type"]);

    const request: RevealNotebookCellsRequest = {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
      range: params.range === undefined ? undefined : this.parseRange(toolName, params.range),
      cell_ids:
        params.cell_ids === undefined ? undefined : this.requiredStringArray(params.cell_ids, `${toolName}.cell_ids`),
      select: params.select === undefined ? undefined : this.requiredBoolean(params.select, `${toolName}.select`),
      reveal_type:
        params.reveal_type === undefined
          ? undefined
          : this.parseEnum(params.reveal_type, `${toolName}.reveal_type`, [
              "default",
              "center",
              "center_if_outside_viewport",
              "top",
            ]),
    };

    if (!request.range && (!request.cell_ids || request.cell_ids.length === 0)) {
      this.failValidation(toolName, "Provide range or cell_ids.");
    }

    return request;
  }

  public parseNotebookUriOnlyInput(
    toolName: Extract<
      ToolName,
      | "get_notebook_outline"
      | "interrupt_execution"
      | "restart_kernel"
      | "get_kernel_info"
      | "select_jupyter_interpreter"
      | "summarize_notebook_state"
    >,
    input: unknown,
  ): {
    notebook_uri: string;
  } {
    const params = this.requireObject(input, toolName);
    this.assertKnownKeys(toolName, params, ["notebook_uri"]);
    return {
      notebook_uri: this.requiredString(params.notebook_uri, `${toolName}.notebook_uri`),
    };
  }

  private parseRange(toolName: ToolName, value: unknown): { start: number; end: number } {
    const range = this.requireObject(value, toolName, "range");
    this.assertKnownKeys(toolName, range, ["start", "end"], "range");

    return {
      start: this.requiredInteger(range.start, `${toolName}.range.start`),
      end: this.requiredInteger(range.end, `${toolName}.range.end`),
    };
  }

  private parseCell(toolName: ToolName, value: unknown): NotebookCellInput {
    const cell = this.requireObject(value, toolName, "cell");
    this.assertKnownKeys(toolName, cell, ["kind", "language", "source", "metadata"], "cell");

    const kind = this.parseEnum(cell.kind, `${toolName}.cell.kind`, ["markdown", "code"]);
    const languageValue = cell.language;
    const metadataValue = cell.metadata;

    const parsedCell: NotebookCellInput = {
      kind,
      source: this.requiredString(cell.source, `${toolName}.cell.source`),
    };

    if (languageValue !== undefined) {
      parsedCell.language =
        languageValue === null ? null : this.requiredString(languageValue, `${toolName}.cell.language`);
    }

    if (metadataValue !== undefined) {
      parsedCell.metadata = this.requiredPlainObject(metadataValue, `${toolName}.cell.metadata`);
    }

    return parsedCell;
  }

  private normalizeInsertCellPosition(position: Record<string, unknown>): InsertCellRequest["position"] {
    const toolName = "insert_cell";
    if (!("mode" in position)) {
      this.failValidation(
        toolName,
        'position must use the mode form like {"mode":"after_cell_id","cell_id":"cell-1"}.',
      );
    }

    return this.normalizeModeInsertPosition(position);
  }

  private normalizeModeInsertPosition(position: Record<string, unknown>): InsertCellRequest["position"] {
    const toolName = "insert_cell";
    const mode = position.mode;
    if (typeof mode !== "string") {
      this.failValidation(
        toolName,
        'position.mode must be one of "before_index", "before_cell_id", "after_cell_id", or "at_end".',
      );
    }

    switch (mode) {
      case "before_index":
        this.assertKnownKeys(toolName, position, ["mode", "index"], "position");
        return { before_index: this.requiredNonNegativeInteger(position.index, "insert_cell.position.index") };
      case "before_cell_id":
        this.assertKnownKeys(toolName, position, ["mode", "cell_id"], "position");
        return { before_cell_id: this.requiredString(position.cell_id, "insert_cell.position.cell_id") };
      case "after_cell_id":
        this.assertKnownKeys(toolName, position, ["mode", "cell_id"], "position");
        return { after_cell_id: this.requiredString(position.cell_id, "insert_cell.position.cell_id") };
      case "at_end":
        this.assertKnownKeys(toolName, position, ["mode"], "position");
        return { at_end: true };
      default: {
        const suggestion = this.closestMatch(mode, ["before_index", "before_cell_id", "after_cell_id", "at_end"]);
        const message = suggestion
          ? `Unknown position.mode "${mode}"; did you mean "${suggestion}"?`
          : `Unknown position.mode "${mode}". Expected "before_index", "before_cell_id", "after_cell_id", or "at_end".`;
        this.failValidation(toolName, message);
      }
    }
  }

  private requireObject(input: unknown, toolName: ToolName, label = "arguments"): ToolInput {
    if (input && typeof input === "object" && !Array.isArray(input)) {
      return input as ToolInput;
    }

    if (input === undefined || input === null) {
      return {};
    }

    this.failValidation(toolName, `${label} must be an object.`);
  }

  private requiredPlainObject(value: unknown, label: string): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    throw new Error(`${label} must be an object.`);
  }

  private requiredString(value: unknown, label: string): string {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    throw new Error(`${label} must be a non-empty string.`);
  }

  private requiredBoolean(value: unknown, label: string): boolean {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      throw new Error(`${label} must be a boolean. Use true or false without quotes.`);
    }

    throw new Error(`${label} must be a boolean.`);
  }

  private requiredInteger(value: unknown, label: string): number {
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === "string") {
      throw new Error(`${label} must be an integer. Use a number like 2 without quotes.`);
    }

    throw new Error(`${label} must be an integer.`);
  }

  private requiredNonNegativeInteger(value: unknown, label: string): number {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }

    throw new Error(`${label} must be a non-negative integer.`);
  }

  private requiredPositiveInteger(value: unknown, label: string): number {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      return value;
    }

    throw new Error(`${label} must be a positive integer.`);
  }

  private requiredStringArray(value: unknown, label: string): string[] {
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0)) {
      return value;
    }

    throw new Error(`${label} must be an array of non-empty strings.`);
  }

  private requiredStringRecord(value: unknown, label: string): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} must be an object whose values are non-empty strings.`);
    }

    const record = value as Record<string, unknown>;
    for (const [key, entry] of Object.entries(record)) {
      if (typeof key !== "string" || key.length === 0 || typeof entry !== "string" || entry.length === 0) {
        throw new Error(`${label} must be an object whose values are non-empty strings.`);
      }
    }

    return record as Record<string, string>;
  }

  private requiredEnumArray<const TValue extends readonly string[]>(
    value: unknown,
    label: string,
    candidates: TValue,
  ): TValue[number][] {
    if (!Array.isArray(value)) {
      throw new Error(`${label} must be an array.`);
    }

    return value.map((entry, index) => this.parseEnum(entry, `${label}[${index}]`, candidates));
  }

  private parseEnum<const TValue extends readonly string[]>(value: unknown, label: string, candidates: TValue): TValue[number] {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${label} must be one of ${candidates.map((candidate) => `"${candidate}"`).join(", ")}.`);
    }

    const match = candidates.find((candidate) => candidate === value);
    if (match) {
      return match;
    }

    const suggestion = this.closestMatch(value, candidates);
    if (suggestion) {
      throw new Error(`${label} has invalid value "${value}"; did you mean "${suggestion}"?`);
    }

    throw new Error(`${label} must be one of ${candidates.map((candidate) => `"${candidate}"`).join(", ")}.`);
  }

  private assertKnownKeys(toolName: ToolName, value: ToolInput, allowedKeys: readonly string[], parentLabel?: string): void {
    const allowed = new Set(allowedKeys);
    const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
    if (!unknownKey) {
      return;
    }

    const suggestion = this.closestMatch(unknownKey, allowedKeys);
    if (suggestion) {
      this.failValidation(
        toolName,
        `Unknown key "${unknownKey}"${parentLabel ? ` in ${parentLabel}` : ""}; expected "${suggestion}".`,
      );
    }

    this.failValidation(
      toolName,
      `Unknown key "${unknownKey}"${parentLabel ? ` in ${parentLabel}` : ""}. Allowed keys: ${allowedKeys.join(", ") || "(none)"}.`,
    );
  }

  private closestMatch(value: string, candidates: readonly string[]): string | undefined {
    let bestCandidate: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const distance = this.levenshteinDistance(value, candidate);
      if (distance < bestDistance) {
        bestCandidate = candidate;
        bestDistance = distance;
      }
    }

    if (!bestCandidate) {
      return undefined;
    }

    const threshold = Math.max(3, Math.floor(bestCandidate.length / 2));
    return bestDistance <= threshold ? bestCandidate : undefined;
  }

  private levenshteinDistance(left: string, right: string): number {
    const rows = left.length + 1;
    const columns = right.length + 1;
    const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

    for (let row = 0; row < rows; row += 1) {
      matrix[row][0] = row;
    }
    for (let column = 0; column < columns; column += 1) {
      matrix[0][column] = column;
    }

    for (let row = 1; row < rows; row += 1) {
      for (let column = 1; column < columns; column += 1) {
        const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
        matrix[row][column] = Math.min(
          matrix[row - 1][column] + 1,
          matrix[row][column - 1] + 1,
          matrix[row - 1][column - 1] + substitutionCost,
        );
      }
    }

    return matrix[left.length][right.length];
  }

  private failValidation(toolName: ToolName, message: string): never {
    throw new Error(`Invalid arguments for tool ${toolName}: ${message}`);
  }
}
