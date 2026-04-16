interface BaseColumn {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number';
  getValue?: (row: any) => any;
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

export interface ActionColumn {
  key: string;
  label: string;
  type: 'action';
  icon: string;
  action: (row: any, reload: () => void) => void;
}

export type ColumnConfig = TextColumn | DateColumn | NumberColumn | ActionColumn;