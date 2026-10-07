import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { API_URL } from '../../core/api.config';
import { TelemetrySnapshot } from '../../contracts/telemetry.contracts';
@Injectable({ providedIn: 'root' })
export class ObservabilityApiService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${inject(API_URL)}/admin/observabilidad/eventos`;
  stream() {
    return new Observable<TelemetrySnapshot>(subscriber => {
      const controller = new AbortController();
      const run = async () => {
        if (typeof fetch !== 'function' || typeof TextDecoder === 'undefined') throw new Error('SSE no disponible.');
        const response = await fetch(this.endpoint.replace(/eventos$/, 'stream'), {
          headers: { Authorization: `Bearer ${this.auth.getToken() || ''}`, Accept: 'text/event-stream' },
          signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new HttpErrorResponse({ status: response.status, statusText: response.statusText });
        if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('SSE no disponible.');
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        try {
          while (!subscriber.closed) {
            const chunk = await reader.read();
            if (chunk.done) { subscriber.complete(); return; }
            buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r/g, '');
            if (buffer.length > 512 * 1024) throw new Error('Stream demasiado grande.');
            let boundary: number;
            while ((boundary = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
              if (!frame.split('\n').some(line => line === 'event: snapshot')) continue;
              const json = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
              subscriber.next(JSON.parse(json) as TelemetrySnapshot);
            }
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      };
      run().catch(error => { if (!subscriber.closed) subscriber.error(error); });
      return () => controller.abort();
    });
  }
  recent() { return this.http.get<TelemetrySnapshot>(this.endpoint); }
}
