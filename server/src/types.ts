export interface EmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  department: string;
  jobTitle: string;
  /** Annual base salary in whole units of `currency`. */
  salary: number;
  currency: string;
  /** ISO date, YYYY-MM-DD. */
  hireDate: string;
}

export interface Employee extends EmployeeInput {
  id: number;
  /** Salary converted to the reporting currency (USD), rounded. */
  salaryUsd: number;
}
