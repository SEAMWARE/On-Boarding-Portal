export interface BaseFilter {
  key: string;
  label: string;
}

export interface TextFilter extends BaseFilter {
  type: 'text';
}

export interface NumberFilter extends BaseFilter {
  type: 'number';
}

export interface EnumOption {
  value: any;
  label: string;
}

export interface EnumFilter extends BaseFilter {
  type: 'enum';
  options: EnumOption[];
  multiple?: boolean;
}

export type FilterConfig = TextFilter | NumberFilter | EnumFilter;

export interface FilterState {
  [key: string]: any;
}