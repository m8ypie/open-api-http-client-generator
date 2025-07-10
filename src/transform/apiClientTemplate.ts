type HttpMethod = "get" | "post" | "put" | "patch" | "head" | "delete";

type Processor = {
  request: <B, R>(
    path: string,
    options: { body?: B; headers?: Record<string, string>; method: HttpMethod },
  ) => Promise<R>;
};

class ProcessorWrapper {
  private _processor: Processor | null = null;

  get processor(): Processor {
    if (!this._processor) {
      throw new Error("Processor not set");
    }
    return this._processor;
  }
  set processor(processor: Processor) {
    this._processor = processor;
  }
}
const processorWrapper = new ProcessorWrapper();

export function initApiClient<B>(processor: Processor) {
  processorWrapper.processor = processor;
}

export const httpClient = {
  request<B, R>(
    path: string,
    options: { body?: B; headers?: Record<string, string>; method: HttpMethod },
  ): Promise<R> {
    return processorWrapper.processor.request<B, R>(path, options);
  },
};
