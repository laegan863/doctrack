export type Division = {
  id: string;
  code: string;
  name: string;
  head?: string;
  active: boolean;
  /** Set once a document has been routed here. Used divisions can be deactivated but not deleted. */
  used?: boolean;
  createdAt: number;
};

export type Unit = {
  id: string;
  divisionId: string;
  code: string;
  name: string;
  head?: string;
  active: boolean;
  /** Set once a document has been routed here. Used units can be deactivated but not deleted. */
  used?: boolean;
  createdAt: number;
};

export type DocType = {
  id: string;
  name: string;
  /** Default number of days to process before the document is flagged overdue. */
  defaultDays: number;
  active: boolean;
  /** Set once a document uses this type. Used types can be deactivated but not deleted. */
  used?: boolean;
};

/** Result returned by settings form actions. */
export type FormState = {
  ok?: boolean;
  error?: string;
  /** Submitted values, echoed back on error so the form can refill them (React resets forms after an action). */
  values?: Record<string, string>;
};
