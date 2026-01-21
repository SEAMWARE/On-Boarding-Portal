import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatToolbarModule } from '@angular/material/toolbar';
import { OnBoardingService, RegistrationForm } from '../../core/services/onboarding.service';
import { RegistrationDetails } from '../../core/components/registration-details/registration-details';
import { ActivatedRoute, Router } from '@angular/router';
import { UploadFile } from "../../core/components/upload-file/upload-file";
import { NotificationService } from '../../core/services/notification';
import { CopyInput } from '../../core/components/copy-input/copy-input';

@Component({
  selector: 'app-submit',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatTabsModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    RegistrationDetails,
    UploadFile,
    CopyInput
],
  templateUrl: './submit.html',
  styleUrl: './submit.scss',
})
export class Submit {
  registrationForm: FormGroup;
  trackingId: string = '';
  isProcessing = signal(false);
  selectedFiles: File[] = [];
  registrationId = '';
  trackedRegistration: any;
  selectedTabIndex = 0;

  constructor(
    private fb: FormBuilder,
    private notification: NotificationService,
    private clipboard: Clipboard,
    private onBoardingService: OnBoardingService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.registrationForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      name: ['', Validators.required],
      did: ['']
    });

    this.route.fragment.subscribe((fragment) => {
      if (fragment === 'register') {
        this.selectedTabIndex = 0;
      } else if (fragment === 'search') {
        this.selectedTabIndex = 1;
      }
    });

    this.route.queryParams.subscribe((params) => {
      const id = params['id'];
      if (id) {
        this.search(id);
      }
    });
  }

  onFileSelected(event: File[]): void {
    this.selectedFiles = event;
    console.debug("files", event)
  }

  removeFile(index: number): void {

    this.selectedFiles.splice(index, 1);

    if (this.selectedFiles.length === 0) {
      this.notification.info('All documents removed', { duration: 2000 });
    }
  }

  submitRegistration(): void {
    if (this.registrationForm.valid) {
      this.isProcessing.set(true);

      this.onBoardingService.submitRegistration(
        this.registrationForm.value as RegistrationForm,
        this.selectedFiles
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

  onSearch(): void {
    if (!this.trackingId) return;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { id: this.trackingId },
      queryParamsHandling: 'merge',
      fragment: 'search'
    });

    this.search(this.trackingId);
  }
  private search(id: string): void {
    this.isProcessing.set(true);
    this.onBoardingService.getRegistration(id).subscribe({
      next: (registration) => {
        this.isProcessing.set(false);
        console.debug("Registration", registration);
        this.trackedRegistration = registration;
      },
      error: (error) => {
        console.error("Error getting registration", error);
        this.isProcessing.set(false);
        this.notification.show(`Registration request ${this.registrationId} not found`);
      }
    })
  }

  updateAnchor(index: number): void {
    const fragment = index === 0 ? 'register' : 'search';
    this.router.navigate([], {
      fragment: fragment,
      queryParamsHandling: 'preserve',
    });
  }
}
