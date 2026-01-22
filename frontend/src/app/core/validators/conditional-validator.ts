import { AbstractControl, ValidationErrors, ValidatorFn } from "@angular/forms";

export function conditionalValidator(conditionFn: () => boolean): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        if (conditionFn()) {
            const value = control.value;
            if (value === null || value === undefined || value.toString().trim() === '') {
                return { required: true };
            }
        }
        return null;
    };
}