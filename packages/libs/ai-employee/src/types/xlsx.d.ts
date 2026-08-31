declare module 'xlsx' {
  export interface WorkSheet {
    [key: string]: any;
  }
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }
  export const utils: {
    sheet_to_json(sheet: WorkSheet, opts?: Record<string, any>): any[];
    json_to_sheet(data: any[], opts?: Record<string, any>): WorkSheet;
    book_new(): WorkBook;
    book_append_sheet(book: WorkBook, sheet: WorkSheet, name?: string): void;
  };
  export function read(data: any, opts?: Record<string, any>): WorkBook;
  export function write(book: WorkBook, opts?: Record<string, any>): any;
  const XLSX: any;
  export = XLSX;
}
