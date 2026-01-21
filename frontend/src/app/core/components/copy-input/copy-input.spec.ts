import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CopyInput } from './copy-input';

describe('CopyInput', () => {
  let component: CopyInput;
  let fixture: ComponentFixture<CopyInput>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CopyInput]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CopyInput);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
