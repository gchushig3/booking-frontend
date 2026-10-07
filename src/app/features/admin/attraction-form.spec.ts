import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../core/api.config';
import { AttractionForm } from './attraction-form';

describe('Guided attraction creation', () => {
  let form: AttractionForm;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttractionForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AttractionForm);
    fixture.detectChanges();
    form = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('prevents advancing with incomplete basic information', () => {
    form.nextStep();
    expect(form.step()).toBe(0);
    expect(form.form.controls.name.touched).toBe(true);
    expect(form.error()).toBeTruthy();
    http.expectNone(() => true);
  });
  it('converts hours to the existing API duration format', () => {
    form.setDuration('3');
    expect(form.payload().duration).toBe('PT3H');
    expect(form.durationHours()).toBe('3');
    form.setDuration('1.5');
    expect(form.form.controls.duration.invalid).toBe(true);
    form.setDuration('0');
    expect(form.form.controls.duration.invalid).toBe(true);
  });
  it('preserves values when moving between steps and rejects invalid photo URLs', () => {
    form.form.patchValue({ name: 'Tour Cotopaxi', long_description: 'Recorrido con guía local.' });
    form.nextStep();
    expect(form.step()).toBe(1);
    form.form.controls.photos.setValue('not-an-image-url');
    form.nextStep();
    expect(form.step()).toBe(1);
    form.form.controls.photos.setValue('https://example.com/photo.jpg');
    form.nextStep();
    expect(form.step()).toBe(2);
    form.previousStep();
    expect(form.previewPhotos()).toEqual(['https://example.com/photo.jpg']);
    expect(form.form.controls.name.value).toBe('Tour Cotopaxi');
    http.expectNone(() => true);
  });
});
