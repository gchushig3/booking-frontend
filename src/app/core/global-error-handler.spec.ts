import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { GlobalErrorHandler } from './global-error-handler';
import { ObservabilityService } from '../services/observability.service';
import { API_URL } from './api.config';

describe('Angular error telemetry', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  it('records Angular errors with sanitized messages and route/timestamp', () => {
    TestBed.configureTestingModule({ providers: [GlobalErrorHandler, provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    TestBed.inject(GlobalErrorHandler).handleError(new Error('password="private multi word"'));
    const event = TestBed.inject(ObservabilityService).events().find(event => event.type === 'angular_error');
    expect(event?.payload['message']).toBe('[redacted]');
    expect(event?.route).toBeTruthy(); expect(Number.isNaN(Date.parse(event!.timestamp))).toBe(false);
  });
});
