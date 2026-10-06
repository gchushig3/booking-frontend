import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessage } from './http-errors';
describe('HTTP error messages', () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    it(`interprets status ${status}`, () => {
      expect(httpErrorMessage(new HttpErrorResponse({ status }))).toBeTruthy();
      expect(httpErrorMessage(new HttpErrorResponse({ status, error: { message: 'Backend message' } }))).toBe('Backend message');
    });
  }
  it('interprets Problem Details from the idempotency guard', () => {
    expect(httpErrorMessage(new HttpErrorResponse({ status: 400, error: { detail: 'UUID v4 required' } }))).toBe('UUID v4 required');
  });
  it('joins backend validation messages', () => {
    expect(httpErrorMessage(new HttpErrorResponse({ status: 400, error: { message: ['Invalid name', 'Invalid ID'] } }))).toBe('Invalid name Invalid ID');
  });
});
