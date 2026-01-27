import { Component, effect, input, model, OnDestroy, OnInit, output, signal } from '@angular/core';
import { RegistrationStatus } from '../../types/registration-status';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { Registration } from '../../types/registration';
import { MatButtonModule } from "@angular/material/button";
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { NotificationService } from '../../services/notification';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OnBoardingService } from '../../services/onboarding.service';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { UploadFile } from '../upload-file/upload-file';

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
    MatTooltipModule,
    UploadFile
  ],
  templateUrl: './registration-details.html',
  styleUrl: './registration-details.scss',
})
export class RegistrationDetails implements OnInit, OnDestroy {

  registration = model.required<Registration>();
  editable = input<boolean>(false);
  readonly editingChange = output<boolean>();

  _registration = signal<Registration |null>(null)
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
    if (this.editable()) {
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

  ngOnDestroy(): void {
    this.destroy$?.unsubscribe();
  }
  initForm() {
    this.registrationForm = this.fb.group({
      status: [this.registration().status],
      did: [this.registration().did],
      id: [{ value: this.registration().id, disabled: true }],
      email: [{ value: this.registration().email, disabled: true }],
      createdAt: [{ value: this.registration().createdAt, disabled: true }],
      updatedAt: [{ value: this.registration().updatedAt, disabled: true }],
      files: [''],
      reason: [{ value: this.registration()?.reason, disabled: true }]
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
    this.editingChange.emit(true);
    this.registrationForm.get('email')?.enable();
    this.registrationForm.get('did')?.enable();
    this.registrationForm.get('files')?.enable();
  }

  cancelReview(): void {
    this._editting.set(false);
    this.editingChange.emit(false);
    this.registrationForm.disable();
  }

  saveChanges(): void {
    if (this.registrationForm.valid && this.registrationForm.dirty) {
      this.cancelReview();
      console.log('Pushing updates to backend...', this.registration);
      let { did, files, email } = this.registrationForm.getRawValue();
      this.onBoardingService.updateRegistration(this.registration().id, { did, file: files[0], email }).subscribe({
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

  canUpdate(): boolean {
    const status = this.registrationForm.get('status')?.value;
    return this.editable() && [RegistrationStatus.SUBMITTED, RegistrationStatus.ACTION_REQUIRED].includes(status)
  }

  onFileSelected(files: File[]): void {
    if (files && files.length > 0) {
      this.registrationForm.patchValue({ files });
      this.registrationForm.get('files')?.markAsDirty();
      this.registrationForm.get('files')?.updateValueAndValidity();
    } else {
      this.registrationForm.patchValue({ file: null });
      this.registrationForm.get('files')?.updateValueAndValidity();
    }
  }

  prettyStatus(status: string) {
    return status.split("_").join(" ");
  }

  removeFile(index: number) {
    this.registration().files?.splice(index, 1);
  }
}
