import {
  ExecuteCellsAsyncRequest,
  ExecuteCellsAsyncResult,
  ExecuteCellsRequest,
  ExecuteCellsResult,
  ExecutionStatusResult,
  GetExecutionStatusRequest,
  InterruptExecutionRequest,
  KernelCommandResult,
  RestartKernelRequest,
  SelectJupyterInterpreterRequest,
  SelectKernelRequest,
  WaitForExecutionRequest,
  WaitForExecutionResult,
  WaitForKernelReadyRequest,
  WaitForKernelReadyResult,
  fail,
} from "../../../packages/protocol/src";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookDocumentService } from "./NotebookDocumentService";
import { NotebookMutationService } from "./NotebookMutationService";
import { NotebookAsyncExecutionService } from "./NotebookAsyncExecutionService";
import { NotebookExecutionService } from "./NotebookExecutionService";
import { NotebookKernelCommandService } from "./NotebookKernelCommandService";

export class NotebookRuntimeApplicationService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly documentService: NotebookDocumentService,
    private readonly mutationService: NotebookMutationService,
    private readonly asyncExecutionService: NotebookAsyncExecutionService,
    private readonly executionService: NotebookExecutionService,
    private readonly kernelCommandService: NotebookKernelCommandService,
  ) {}

  public async executeCells(request: ExecuteCellsRequest): Promise<ExecuteCellsResult> {
    if ((request as { wait_for_completion?: boolean }).wait_for_completion === false) {
      fail({
        code: "InvalidRequest",
        message: "wait_for_completion=false is not supported. Use execute_cells_async for non-blocking execution.",
        recoverable: true,
      });
    }

    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.documentService.requireReadyDocument(request.notebook_uri);
      this.mutationService.assertExpectedVersion(
        this.registry.getVersion(request.notebook_uri),
        request.expected_notebook_version,
      );
      return this.executionService.executeCells(document, request);
    });
  }

  public async executeCellsAsync(request: ExecuteCellsAsyncRequest): Promise<ExecuteCellsAsyncResult> {
    return this.asyncExecutionService.executeCellsAsync(request);
  }

  public getExecutionStatus(request: GetExecutionStatusRequest): ExecutionStatusResult {
    return this.asyncExecutionService.getExecutionStatus(request);
  }

  public waitForExecution(request: WaitForExecutionRequest): Promise<WaitForExecutionResult> {
    return this.asyncExecutionService.waitForExecution(request);
  }

  public async selectKernel(request: SelectKernelRequest): Promise<KernelCommandResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.documentService.requireReadyDocument(request.notebook_uri);
      return this.kernelCommandService.selectKernel(document, request);
    });
  }

  public async selectJupyterInterpreter(request: SelectJupyterInterpreterRequest): Promise<KernelCommandResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.documentService.requireReadyDocument(request.notebook_uri);
      return this.kernelCommandService.selectJupyterInterpreter(document);
    });
  }

  public async restartKernel(request: RestartKernelRequest): Promise<KernelCommandResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.documentService.requireReadyDocument(request.notebook_uri);
      return this.kernelCommandService.restartKernel(document);
    });
  }

  public async interruptExecution(request: InterruptExecutionRequest): Promise<KernelCommandResult> {
    return this.registry.runExclusive(request.notebook_uri, async () => {
      const document = await this.documentService.requireReadyDocument(request.notebook_uri);
      return this.kernelCommandService.interruptExecution(document);
    });
  }

  public async waitForKernelReady(request: WaitForKernelReadyRequest): Promise<WaitForKernelReadyResult> {
    const document = await this.documentService.requireReadyDocument(request.notebook_uri);
    return this.kernelCommandService.waitForKernelReady(document, request);
  }
}
