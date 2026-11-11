export type Division = {
  id: string;
  code: string;
  name: string;
  head?: string;
  active: boolean;
  createdAt: number;
};

export type Unit = {
  id: string;
  divisionId: string;
  code: string;
  name: string;
  head?: string;
  active: boolean;
  createdAt: number;
};

export type DocType = {
  id: string;
  name: string;
  /** Default number of days to process before the document is flagged overdue. */
  defaultDays: number;
  active: boolean;
};
