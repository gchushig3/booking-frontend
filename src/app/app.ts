import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { ObservabilityService } from './services/observability.service';
import { ToastService } from './services/toast.service';
import { ToastContainer } from './toast-container';

function identityPasswordPolicy(minimumCodePoints: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '');
    const codePoints = Array.from(value).length;
    const bytes = new TextEncoder().encode(value).length;
    if (codePoints < minimumCodePoints) return { minlength: { requiredLength: minimumCodePoints, actualLength: codePoints } };
    if (bytes > 72) return { maxlength: { requiredLength: 72, actualLength: bytes } };
    return value.includes('\0') ? { nulByte: true } : null;
  };
}

@Component({
  imports: [ReactiveFormsModule, ToastContainer, RouterLink, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly observability = inject(ObservabilityService);
  protected readonly autenticado = this.authService.authenticated;
  protected readonly usuario = this.authService.user;
  protected readonly loginModalAbierto = signal(false);
  protected readonly modoRegistro = signal(false);
  protected readonly loginEnviando = signal(false);
  protected readonly errorLogin = signal('');
  protected readonly authMessage = signal('');
  protected readonly loginForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(160)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, identityPasswordPolicy(1)] }),
  });
  protected readonly registerForm = new FormGroup({
    first_name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(1), Validators.maxLength(120)] }),
    last_name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(1), Validators.maxLength(120)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(160)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, identityPasswordPolicy(12)] }),
  });

  protected abrirLogin(): void {
    this.observability.track('modal', 'login_modal_opened');
    this.errorLogin.set('');
    this.authMessage.set('');
    this.modoRegistro.set(false);
    this.loginModalAbierto.set(true);
  }

  protected mostrarRegistro(): void {
    this.errorLogin.set('');
    this.authMessage.set('');
    this.registerForm.reset({ first_name: '', last_name: '', email: this.loginForm.controls.email.value, password: '' });
    this.modoRegistro.set(true);
  }

  protected mostrarLogin(): void {
    this.errorLogin.set('');
    this.authMessage.set('');
    this.loginForm.controls.email.setValue(this.registerForm.controls.email.value);
    this.loginForm.controls.email.markAsUntouched();
    this.modoRegistro.set(false);
  }

  protected cerrarLogin(): void {
    if (this.loginEnviando()) return;
    this.loginModalAbierto.set(false);
    this.errorLogin.set('');
    this.authMessage.set('');
  }

  protected cerrarSesion(): void {
    this.observability.track('auth', 'logout');
    this.authService.logout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.toastService.mostrar('info', 'Has cerrado sesión correctamente.'),
      error: () => this.toastService.mostrar('error', 'Se cerró la sesión en este navegador, pero Identity no confirmó la revocación.'),
    });
  }

  protected iniciarSesion(): void {
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid || this.loginEnviando()) return;
    this.loginEnviando.set(true);
    this.observability.track('auth', 'login_attempt');
    this.errorLogin.set('');
    this.authMessage.set('');
    this.authService.login(this.loginForm.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (usuario) => {
        this.observability.track('auth', 'login_success');
        this.loginEnviando.set(false);
        this.loginModalAbierto.set(false);
        this.modoRegistro.set(false);
        this.loginForm.reset({ email: usuario.email, password: '' });
        this.toastService.mostrar('exito', 'Sesión iniciada correctamente. ¡Bienvenido!');
      },
      error: (error: unknown) => this.mostrarErrorAuth(error),
    });
  }

  protected registrarse(): void {
    this.registerForm.markAllAsTouched();
    if (this.registerForm.invalid || this.registerForm.pending || this.loginEnviando()) return;
    this.loginEnviando.set(true);
    this.observability.track('auth', 'registration_attempt');
    this.errorLogin.set('');
    this.authMessage.set('');
    this.authService.register(this.registerForm.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ user, verification_email_sent }) => {
        this.loginEnviando.set(false);
        this.loginForm.reset({ email: user.email, password: '' });
        this.modoRegistro.set(false);
        this.authMessage.set(verification_email_sent
          ? 'Cuenta creada. Revisa tu correo para completar la verificación. Ya puedes iniciar sesión.'
          : 'Cuenta creada, pero no se pudo enviar el correo de verificación. Ya puedes iniciar sesión; solicita un reenvío al equipo de soporte.');
        this.toastService.mostrar('info', 'Cuenta creada. Revisa el estado de verificación de tu correo.');
      },
      error: (error: unknown) => this.mostrarErrorAuth(error),
    });
  }

  private mostrarErrorAuth(error: unknown): void {
    this.loginEnviando.set(false);
    const mensaje = this.authService.getLoginErrorMessage(error);
    this.errorLogin.set(mensaje);
    this.toastService.mostrar('error', mensaje);
  }
}
