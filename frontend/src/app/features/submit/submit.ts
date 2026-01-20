import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatToolbarModule } from '@angular/material/toolbar';
import { OnBoardingService, RequestForm } from '../../core/services/onboarding.service';

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
    MatDividerModule,
    MatSnackBarModule,
    MatToolbarModule
  ],
  templateUrl: './submit.html',
  styleUrl: './submit.scss',
})
export class Submit {
  registrationForm: FormGroup;
  trackingId: string = '';
  isProcessing = signal(false);
  selectedFiles: File[] = [];
  requestId = '';
  constructor(
    private fb: FormBuilder,
     private snackBar: MatSnackBar,
     private clipboard: Clipboard,
     private onBoardingService: OnBoardingService
    ) {
    this.registrationForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      name: ['', Validators.required],
      did: ['']
    });
  }

  onFileSelected(event: any): void {
    if (event.target.files) {
      this.selectedFiles = Array.from(event.target.files);
    }
  }

  submitRegistration(): void {
    if (this.registrationForm.valid) {
      this.isProcessing.set(true);

      this.onBoardingService.submitRequest(
        this.registrationForm.value as RequestForm,
        this.selectedFiles
      ).subscribe({
        next: (response) => {
          this.requestId = response.requestId;
          this.isProcessing.set(false);
        },
        error: (err) => {
          this.isProcessing.set(false);
          this.snackBar.open('Error submitting the application', 'Close', { duration: 5000 });
          console.error('Submission Error:', err);
        }
      });
    }
  }

  // --- Application Tracking Logic ---
  resumeApplication(): void {
    if (!this.trackingId) return;

    this.isProcessing.set(true);
    // Simulate API retrieval
    setTimeout(() => {
      console.log('Retrieving ID:', this.trackingId);
      this.isProcessing.set(false);
      this.snackBar.open('Application status retrieved', 'Close', { duration: 3000 });
    }, 200);
  }

  copyRequestId(): void {
    this.clipboard.copy(this.requestId);
    this.snackBar.open('Request ID copied to clipboard', 'Dismiss', { duration: 2000 });
  }
}
