import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-toolbar',
  imports: [MatToolbarModule, MatIconModule, MatButtonModule, MatIconModule],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class Toolbar {

  @Input() showAdminLogin = true;
  @Input() showOnBoarding = true;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) { }

  onAdminLogin() {

    this.authService.login();
  }

  onSubmit(): void {
    this.router.navigate(['/submit']);
  }

  goLading(): void {
    this.router.navigate(['/'])
  }
}
