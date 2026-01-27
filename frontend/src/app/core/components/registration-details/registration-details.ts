import { Component, effect, input, model, OnDestroy, OnInit, output, signal } from '@angular/core';
import { RegistrationStatus } from '../../types/registration-status';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { Registration } from '../../types/registration';
import { MatButtonModule } from "@angular/material/button";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { NotificationService } from '../../services/notification';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OnBoardingService, REGISTRATION_UPDATE_KEYS } from '../../services/onboarding.service';
import { Subscription } from 'rxjs';
import { UploadFile } from '../upload-file/upload-file';
import { MatTabsModule } from '@angular/material/tabs';

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
    UploadFile,
    MatTabsModule
  ],
  templateUrl: './registration-details.html',
  styleUrl: './registration-details.scss',
})
export class RegistrationDetails implements OnInit, OnDestroy {

  registration = model.required<Registration>();
  editable = input<boolean>(false);
  readonly editingChange = output<boolean>();

  _registration = signal<Registration | null>(null)
  _editting = signal(false);
  statusOptions = Object.values(RegistrationStatus);
  registrationForm!: FormGroup;
  private destroy$?: Subscription;

  constructor(
    private fb: FormBuilder,
    private notification: NotificationService,
    private onBoardingService: OnBoardingService
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
      files: [this.registration().files],
      reason: [{ value: this.registration()?.reason, disabled: true }],

      name: [this.registration().name, Validators.required],
      taxId: [this.registration().taxId, Validators.required],
      address: [this.registration().address, Validators.required],
      city: [this.registration().city, Validators.required],
      postCode: [this.registration().postCode, Validators.required],
      country: [this.registration().country, Validators.required]
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
    REGISTRATION_UPDATE_KEYS.forEach(field => this.registrationForm.get(field)?.enable())
  }

  cancelReview(resetForm = true): void {
    this._editting.set(false);
    this.editingChange.emit(false);
    if (resetForm) {
      this.registrationForm.patchValue(this.registration());
    }
    this.registrationForm.disable();
  }

  saveChanges(): void {
    if (this.registrationForm.valid && this.registrationForm.dirty) {
      this.cancelReview(false);
      const {files, ...data} = this.getDirtyValues(this.registrationForm)
      console.log('Pushing updates to backend...', data);
      REGISTRATION_UPDATE_KEYS.forEach(field => {
        data[field] = this.registrationForm.get(field)?.getRawValue();
      })

      this.onBoardingService.updateRegistration(this.registration().id, data, files?.[0]).subscribe({
        next: (resp) => {
          console.log("Update response", resp);
          this.registration.set(resp);
          this.registrationForm.patchValue(resp);
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
    } else {
      this.registrationForm.patchValue({ file: null });
    }
    this.registrationForm.get('files')?.markAsDirty();
    this.registrationForm.get('files')?.updateValueAndValidity();
  }

  prettyStatus(status: string) {
    return status.split("_").join(" ");
  }

  removeFile(index: number) {
    const currentFiles = [...(this.registrationForm.get('files')?.value || [])];
    currentFiles.splice(index, 1);

    this.registrationForm.patchValue({ files: currentFiles });
    this.registrationForm.get('files')?.markAsDirty();
  }

  private getDirtyValues(form: FormGroup) {
    const dirtyValues: any = {};

    Object.keys(form.controls).forEach(key => {
      const control = form.get(key);
      if (control?.dirty) {
        dirtyValues[key] = control.value;
      }
    });

    return dirtyValues;
  }

}
