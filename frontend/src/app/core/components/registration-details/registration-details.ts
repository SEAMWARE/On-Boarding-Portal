import { Component, effect, Input, OnInit, signal } from '@angular/core';
import { RegistrationStatus } from '../../types/registration-status';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { FileMetadata, Registration } from '../../types/registration';
import { MatButtonModule } from "@angular/material/button";
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { NotificationService } from '../../services/notification';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OnBoardingService } from '../../services/onboarding.service';
import { conditionalValidator } from '../../validators/conditional-validator';

@Component({
  selector: 'app-registration-details',
  imports: [CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatChipsModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatChipsModule,
    MatTooltipModule
  ],
  templateUrl: './registration-details.html',
  styleUrl: './registration-details.scss',
})
export class RegistrationDetails implements OnInit {

  @Input({ required: true }) registration!: Registration;
  @Input() editable: boolean = false;

  _editting = signal(false);
  statusOptions = Object.values(RegistrationStatus);
  registrationForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private notification: NotificationService,
    private onBoardingService: OnBoardingService
  ) {
    if (this.editable) {
      effect(() => {
        if (this.registrationForm) {
          this._editting() ? this.registrationForm.enable() : this.registrationForm.disable();
        }
      })
    };
  }

  ngOnInit() {
    this.initForm();
  }

  initForm() {
    this.registrationForm = this.fb.group({
      status: [this.registration.status],
      did: [this.registration.did],
      id: [{ value: this.registration.id, disabled: true }],
      email: [{ value: this.registration.email, disabled: true }],
      createdAt: [{ value: this.registration.createdAt, disabled: true }],
      updatedAt: [{ value: this.registration.updatedAt, disabled: true }],
      files: [''],
      reason: [this.registration?.reason, [conditionalValidator(() => this.needRevision())]]
    });

    this.registrationForm.get('status')?.valueChanges.subscribe(() => {
      this.registrationForm.get('reason')?.updateValueAndValidity();
    });
    if (!this._editting()) {
      this.registrationForm.disable();
    }

  }

  getStatusColor(status: RegistrationStatus): string {
    const colors: Record<RegistrationStatus, string> = {
      [RegistrationStatus.PENDING]: 'warn',
      [RegistrationStatus.SUBMITTED]: 'accent',
      [RegistrationStatus.UNDER_REVIEW]: 'primary',
      [RegistrationStatus.ACTION_REQUIRED]: 'warn',
      [RegistrationStatus.ACTIVE]: 'success'
    };
    return colors[status] || 'default';
  }

  enableReview(): void {
    this._editting.set(true);
    this.registrationForm.enable();
  }

  cancelReview(): void {
    this._editting.set(false);
    this.registrationForm.disable();
  }

  saveChanges(): void {
    if (this.registrationForm.valid && this.registrationForm.dirty) {
      this.cancelReview();
      console.log('Pushing updates to backend...', this.registration);
      let { status, reason } = this.registrationForm.getRawValue();
      reason = this.needRevision() ? reason : null;
      this.onBoardingService.updateAdminRegistration(this.registration.id, { status, reason }).subscribe({
        next: (resp) => {
          console.log("Update response", resp);
          this.registration = resp;
          this.notification.show('Registration updated')
        },
        error: (error) => {
          this.enableReview();
          console.error("Error updating registry", error);
          this.notification.error('Registration update failed')
        }
      })
    }
  }

  needRevision(): boolean {
    if (this.registrationForm) {
      return this.registrationForm.get('status')?.value === RegistrationStatus.ACTION_REQUIRED;
    }
    return false;
  }

  previewFile(file: FileMetadata): void {

    this.onBoardingService.getAdminFile(this.registration.id, file.name).subscribe({
      next: (blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const newWindow = window.open(blobUrl, '_blank');

        if (!newWindow) {
          this.notification.info('Please allow pop-ups to preview the PDF');
        }
      },
      error: (error) => {
        console.log("Error download file", error);
        this.notification.error("Error opening file");
      }
    })
  }

  prettyStatus(status: string) {
    return status.split("_").join(" ");
  }
}
