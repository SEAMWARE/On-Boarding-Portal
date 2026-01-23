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
import { OnBoardingService } from '../../core/services/onboarding.service';
import { RegistrationDetails } from '../../core/components/registration-details/registration-details';
import { ActivatedRoute, Router } from '@angular/router';
import { NotificationService } from '../../core/services/notification';
import { Toolbar } from '../../core/components/toolbar/toolbar';
import { RegistrationForm } from '../../core/components/registration-form/registration-form';

const ANCHOR_SECTIONS: string[] = [
  'register',
  'search'
];

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
    Toolbar,
    RegistrationDetails,
    RegistrationForm
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
      this.selectedTabIndex = (fragment ? ANCHOR_SECTIONS.indexOf(fragment) : 0) || 0
    });

    this.route.queryParams.subscribe((params) => {
      const id = params['id'];
      if (id) {
        this.search(id);
      }
    });
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
    const fragment = ANCHOR_SECTIONS[index];

    this.router.navigate([], {
      fragment: fragment,
      queryParamsHandling: 'preserve',
    });
  }
}
