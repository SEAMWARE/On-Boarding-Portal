interface BaseColumn {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number';
}

export interface TextColumn extends BaseColumn {
  type: 'text';
  uppercase?: boolean;
}

export interface DateColumn extends BaseColumn {
  type: 'date';
  dateFormat?: string;
}

export interface NumberColumn extends BaseColumn {
  type: 'number';
  precision?: number;
}

export type ColumnConfig = TextColumn | DateColumn | NumberColumn;