
export const DOUBLE_CURLY_BRACE_REGEX = /\{\{\s*([\w.]+)\s*\}\}/g;
export const DOLLAR_REGEX = /\$\{\s*([\w.]+)\s*\}/g

export class TemplateService {

    private readonly regex: RegExp

    constructor(regex: RegExp = DOUBLE_CURLY_BRACE_REGEX) {
        this.regex = regex;
    }

    replace(value: string, variables: Object): string {
        return value.replace(this.regex, (_, key) =>
            this.getValueByPath(variables, key)
        );
    }

    private getValueByPath(context: Object, path: string) {
        if (!path) return "";

        const result = path.split('.').reduce((acc, part) => {
            return (acc && acc[part] !== undefined) ? acc[part] : undefined;
        }, context as any);

        return result !== undefined && result !== null ? result : "";
    };
}