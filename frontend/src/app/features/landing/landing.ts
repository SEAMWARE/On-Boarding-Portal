import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { AuthService } from '../../core/services/auth';
import { Router } from '@angular/router';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatToolbarModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule
  ],
  templateUrl: './landing.html',
  styleUrls: ['./landing.scss']
})
export class Landing {

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  onAdminLogin() {

      this.authService.login();
  }

  onSubmit(): void {
    this.router.navigate(['/submit']);
  }

}