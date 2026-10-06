export type TelemetryCategory = 'PERFORMANCE' | 'ERROR' | 'RESOURCE_ERROR' | 'INTERACTION' | 'VISIBILITY' | 'VIEWPORT' | 'CONNECTION' | 'CAPABILITY' | 'HTTP' | 'DOMAIN';
export interface BrowserEvent {
  id?: string; receivedAt?: string; category: TelemetryCategory; type: string; timestamp: string; route: string; sessionId: string;
  payload: Record<string, string | number | boolean>;
}
export interface TelemetrySnapshot {
  events: BrowserEvent[];
  summary: { sampleSize: number; sampleLimit: number; counts: Record<TelemetryCategory, number>; navigationSamples: number; averageLoadMs: number | null };
  generatedAt: string;
}
export function safeTelemetryUrl(value: string): string {
  try {
    const url = new URL(value, location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return '/unsupported-url';
    const path = url.pathname.split('/').map(segment => {
      let decoded: string;
      try { decoded = decodeURIComponent(segment); } catch { return '[redacted]'; }
      return decoded.length > 64 || /@|\b\d{7,}\b|eyJ|(?:password|token|authorization|cookie|pan|cvv|cvc|secret|cedula|cédula|identity_number)[=:]/i.test(decoded) ? '[redacted]' : segment;
    }).join('/');
    return (value.startsWith('/') ? path : `${url.origin}${path}`).slice(0, 200);
  } catch { return '/invalid-url'; }
}
export function safeTelemetryText(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, safeTelemetryUrl)
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}\b/g, '[redacted]')
    .replace(/(?:password|token|authorization|cookies?|pan|cvv|cvc|secret|cedula|cédula|identity_number)["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n}]+)/gi, '[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[redacted]')
    .replace(/\b\d{7,}\b/g, '[redacted]').slice(0, 240);
}
