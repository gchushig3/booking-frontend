import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { ObservabilityService } from '../services/observability.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private readonly injector: Injector) {}

  handleError(error: unknown): void {
    try {
      this.injector.get(ObservabilityService).track('js', 'angular_error', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.slice(0, 1000) : undefined,
      });
    } catch { /* Error reporting must never cause a second application error. */ }
    console.error(error);
  }
}
