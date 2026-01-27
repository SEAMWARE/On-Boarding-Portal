import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
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
  trackingId: string = '';
  isProcessing = signal(false);
  selectedFiles: File[] = [];
  registrationId = '';
  trackedRegistration: any;
  selectedTabIndex = 0;
  _editing = signal(false);

  constructor(
    private fb: FormBuilder,
    private notification: NotificationService,
    private onBoardingService: OnBoardingService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    const fragment = this.route.snapshot.fragment;
    this.selectedTabIndex = (fragment ? ANCHOR_SECTIONS.indexOf(fragment) : 0) || 0

    const id = this.route.snapshot.queryParamMap.get('id')
    if (id && this.trackingId != id) {
      this.trackingId = id;
      this.search(id);
    }
  }

  onSearch(): void {
    if (!this.trackingId) return;

    this.setIdQueryParam(this.trackingId);

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
        this.notification.error(`Registration request ${this.registrationId} not found`);
        this.setIdQueryParam();
      }
    })
  }

  private setIdQueryParam(id?: string) {
    const query = id ? { id } : null
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: query,
      queryParamsHandling: 'replace',
      fragment: 'search'
    });
  }

  updateAnchor(index: number): void {
    const fragment = ANCHOR_SECTIONS[index];

    this.router.navigate([], {
      fragment: fragment,
      queryParamsHandling: 'preserve',
    });
  }
}
