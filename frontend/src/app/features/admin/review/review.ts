import { Component, OnInit, signal } from '@angular/core';
import { RegistrationDetails } from '../../../core/components/registration-details/registration-details';
import { Registration } from '../../../core/types/registration';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Toolbar } from "../../../core/components/toolbar/toolbar";
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, Router } from '@angular/router';
import { OnBoardingService } from '../../../core/services/onboarding.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-review',
  imports: [RegistrationDetails, MatProgressBarModule, MatCardModule, Toolbar, MatIconModule, MatButtonModule],
  templateUrl: './review.html',
  styleUrl: './review.scss',
})
export class Review implements OnInit {

  registration?: Registration;
  isLoading = signal(false);
  registrationId: string;

  constructor(
    private route: ActivatedRoute,
    private onBoardingService: OnBoardingService,
    private router: Router
  ) {
    this.registrationId = this.route.snapshot.paramMap.get('registrationId')!;
  }

  ngOnInit(): void {
    this.fetchRegistration();
  }

  fetchRegistration() {
    this.isLoading.set(true);

    this.onBoardingService.getAdminRegistration(this.registrationId).subscribe({
      next: (data) => {
        this.registration = data;
        this.isLoading.set(false);
      },
      error: (error) => {
        console.log("Error loading registration", error);
        this.isLoading.set(false);
      }
    })
  }

  goBack() {
    this.router.navigate(['/admin'])
  }
}
