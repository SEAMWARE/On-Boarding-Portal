import { Component, effect, model, OnDestroy, OnInit, signal } from '@angular/core';
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
import { MatDialog } from '@angular/material/dialog';
import { PdfViewer } from '../pdf-viewer/pdf-viewer';
import { Subscription } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-admin-registration-details',
  imports: [CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatChipsModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatChipsModule,
    MatTooltipModule,
    MatTabsModule
  ],
  templateUrl: './admin-registration-details.html',
  styleUrl: './admin-registration-details.scss',
})
export class AdminRegistrationDetails implements OnInit, OnDestroy {

  registration = model.required<Registration>();
  _editting = signal(false);
  statusOptions = Object.values(RegistrationStatus);
  registrationForm!: FormGroup;
  private destroy$?: Subscription;

  constructor(
    private fb: FormBuilder,
    private notification: NotificationService,
    private onBoardingService: OnBoardingService,
    private dialog: MatDialog
  ) {
    effect(() => {
      if (this.registrationForm) {
        this._editting() ? this.enableReview() : this.cancelReview();
      }
    })
  }

  ngOnInit() {
    this.initForm();
  }

  ngOnDestroy(): void {
    this.destroy$?.unsubscribe();
  }
  initForm() {
    this.registrationForm = this.fb.group({
      status: [this.registration().status],
      did: [{value: this.registration().did, disabled: true}],
      id: [{ value: this.registration().id, disabled: true }],
      email: [{ value: this.registration().email, disabled: true }],
      createdAt: [{ value: this.registration().createdAt, disabled: true }],
      updatedAt: [{ value: this.registration().updatedAt, disabled: true }],
      files: [''],
      reason: [this.registration().reason, [conditionalValidator(() => this.needRevision())]],
      name: [{value: this.registration().name, disabled: true}],
      taxId: [{value: this.registration().taxId, disabled: true}],
      address: [{value: this.registration().address, disabled: true}],
      city: [{value: this.registration().city, disabled: true}],
      postCode: [{value: this.registration().postCode, disabled: true}],
      country: [{value: this.registration().country, disabled: true}]
    });

    this.destroy$ = this.registrationForm.get('status')?.valueChanges
      .subscribe(() => {
        this.registrationForm.get('reason')?.updateValueAndValidity();
      });
    if (!this._editting()) {
      this.registrationForm.disable();
    }

  }
  enableReview(): void {
    this._editting.set(true);

    this.registrationForm.get('status')?.enable();
    this.registrationForm.get('reason')?.enable();
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
      this.onBoardingService.updateAdminRegistration(this.registration().id, { status, reason }).subscribe({
        next: (resp) => {
          console.log("Update response", resp);
          this.registration.set(resp);
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
      return [RegistrationStatus.REJECTED, RegistrationStatus.ACTION_REQUIRED].includes(this.registrationForm.get('status')?.value);
    }
    return false;
  }

  previewFile(file: FileMetadata): void {

    this.onBoardingService.getAdminFile(this.registration().id, file.name).subscribe({
      next: (blob) => {
        this.dialog.open(PdfViewer, {
          data: { blob: blob, title: file.name },
          maxWidth: '100vw',
          maxHeight: '100vh',
          autoFocus: false
        });
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
