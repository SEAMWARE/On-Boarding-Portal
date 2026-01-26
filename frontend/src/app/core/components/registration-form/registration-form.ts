import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { UploadFile } from '../upload-file/upload-file';
import { CopyInput } from '../copy-input/copy-input';
import { OnBoardingService, RegistrationInfo } from '../../services/onboarding.service';
import { NotificationService } from '../../services/notification';
import { STEPPER_GLOBAL_OPTIONS } from '@angular/cdk/stepper';

@Component({
  selector: 'app-registration-form',
  providers: [
    {
      provide: STEPPER_GLOBAL_OPTIONS,
      useValue: { showError: true },
    },
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    UploadFile,
    CopyInput
  ],
  templateUrl: './registration-form.html',
  styleUrl: './registration-form.scss',
})
export class RegistrationForm {

  isProcessing = signal<boolean>(false);
  registrationId?: string;

  contactForm: FormGroup;
  orgForm: FormGroup;
  legalForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private onBoardingService: OnBoardingService,
    private notification: NotificationService
  ) {
    this.contactForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      did: ['', [Validators.required, Validators.pattern(/^did:[a-z0-9]+:[a-zA-Z0-9\.\-_%:]+$/)]]
    });

    this.orgForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      taxId: ['', Validators.required],
      address: ['', Validators.required],
      city: ['', Validators.required],
      postCode: ['', Validators.required],
      country: ['', Validators.required]
    });

    this.legalForm = this.fb.group({
      file: [null, Validators.required]
    });
  }

  onFileSelected(files: File[]): void {
    if (files && files.length > 0) {
      this.legalForm.patchValue({ file: files[0] });
      this.legalForm.get('file')?.markAsDirty();
      this.legalForm.get('file')?.updateValueAndValidity();
    } else {
      this.legalForm.patchValue({ file: null });
      this.legalForm.get('file')?.updateValueAndValidity();
    }
  }


  submitRegistration(): void {

    if (this.contactForm.valid && this.orgForm.valid && this.legalForm.valid) {
      this.isProcessing.set(true);

      const data = { ...this.contactForm.value, ...this.orgForm.value }
      this.onBoardingService.submitRegistration(
        data as RegistrationInfo,
        this.legalForm.get('file')!.value as File
      ).subscribe({
        next: (response) => {
          this.registrationId = response.id;
          this.isProcessing.set(false);
        },
        error: (err) => {
          this.isProcessing.set(false);
          this.notification.error('Error submitting the application');
          console.error('Submission Error:', err);
        }
      });
    }
  }
}
