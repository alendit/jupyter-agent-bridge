import {
  ExecuteCellsRequest,
  ExecuteCellsResult,
  InterruptExecutionRequest,
  KernelCommandResult,
  RestartKernelRequest,
  SelectJupyterInterpreterRequest,
  SelectKernelRequest,
  WaitForKernelReadyRequest,
  WaitForKernelReadyResult,
  fail,
} from "../../../packages/protocol/src";
import { NotebookRegistry } from "./NotebookRegistry";
import { NotebookDocumentService } from "./NotebookDocumentService";
import { NotebookMutationService } from "./NotebookMutationService";
import { NotebookExecutionService } from "./NotebookExecutionService";
import { NotebookKernelCommandService } from "./NotebookKernelCommandService";

export class NotebookRuntimeApplicationService {
  public constructor(
    private readonly registry: NotebookRegistry,
    private readonly documentService: NotebookDocumentService,
    private readonly mutationService: NotebookMutationService,
    private readonly executionService: NotebookExecutionService,
    private readonly kernelCommandService: NotebookKernelCommandService,
  ) {}

  public async executeCells(request: ExecuteCellsRequest): Promise<ExecuteCellsResult> {
    if ((request as { wait_for_completion?: boolean }).wait_for_completion === false) {
      fail({
        code: "InvalidRequest",
        message: "wait_for_completion=false is not supported in the MVP.",
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
