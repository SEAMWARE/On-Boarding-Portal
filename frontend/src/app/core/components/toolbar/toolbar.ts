import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-toolbar',
  imports: [MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule
  ],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class Toolbar {

  @Input() showAdminLogin = true;
  @Input() showOnBoarding = true;
  @Input() showUserMenu = false;
  user: any;
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
    this.user = this.authService.getUser();
    console.log(this.user);
  }

  isLogged() {
    return this.authService.isLoggedIn;
  }

  onAdminLogin() {
    this.authService.login();
  }

  onSubmit(): void {
    this.router.navigate(['/submit']);
  }

  goAdminDashboard() {
    this.router.navigate(['/admin'])
  }
  goLanding(): void {
    this.router.navigate(['/'])
  }

  onLogout(): void {
    this.authService.logout()
    this.goLanding();
  }
}
