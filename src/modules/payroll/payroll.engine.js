/**
 * Rendara Pro — Payroll Engine
 * LIRS Progressive PAYE Computation (Finance Act 2023)
 * NHF: 2.5% of basic salary
 * Pension: 8% employee / 10% employer (PRA 2014)
 * CRA: Higher of ₦200,000 or 1% of Gross + 20% of Gross
 */

const PAYE_BANDS = [
  { limit: 300000,   rate: 0.07 },
  { limit: 300000,   rate: 0.11 },
  { limit: 500000,   rate: 0.15 },
  { limit: 500000,   rate: 0.19 },
  { limit: 1600000,  rate: 0.21 },
  { limit: Infinity, rate: 0.24 },
];

/**
 * Compute PAYE from annual taxable income
 */
const computePAYE = (annualTaxable) => {
  if (annualTaxable <= 0) return 0;
  let tax = 0;
  let remaining = annualTaxable;
  for (const band of PAYE_BANDS) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, band.limit);
    tax += taxable * band.rate;
    remaining -= taxable;
  }
  return Math.round(tax);
};

/**
 * Compute all payroll items for one employee per month
 */
const computeEmployee = (employee) => {
  const gross = parseFloat(employee.gross_salary || 0);
  const basic = parseFloat(employee.basic_salary || gross * 0.5);
  const housing = parseFloat(employee.housing || gross * 0.25);
  const transport = parseFloat(employee.transport || gross * 0.1);

  // Annual gross
  const annualGross = gross * 12;

  // CRA = Higher of ₦200,000 or (1% gross + 20% gross)
  const craOption1 = 200000;
  const craOption2 = annualGross * 0.01 + annualGross * 0.20;
  const annualCRA = Math.max(craOption1, craOption2);

  // Pension (employee 8% of basic+housing+transport)
  const pensionBase = basic + housing + transport;
  const monthlyPension = pensionBase * (parseFloat(employee.pension_rate || 8) / 100);
  const annualPension = monthlyPension * 12;

  // NHF (2.5% of basic monthly)
  const monthlyNHF = basic * (parseFloat(employee.nhf_rate || 2.5) / 100);
  const annualNHF = monthlyNHF * 12;

  // Taxable income = Annual gross - CRA - Pension - NHF
  const annualTaxable = Math.max(0, annualGross - annualCRA - annualPension - annualNHF);

  // Annual PAYE
  const annualPAYE = computePAYE(annualTaxable);

  // Monthly figures
  const monthlyPAYE = Math.round(annualPAYE / 12);
  const monthlyCRA = Math.round(annualCRA / 12);
  const monthlyTaxable = Math.round(annualTaxable / 12);
  const netPay = gross - monthlyPAYE - monthlyPension - monthlyNHF;

  return {
    employee_id: employee.id,
    gross_salary: gross,
    basic,
    housing,
    transport,
    gross_income: gross,
    cra: monthlyCRA,
    pension_employee: Math.round(monthlyPension),
    nhf: Math.round(monthlyNHF),
    taxable_income: monthlyTaxable,
    paye: monthlyPAYE,
    net_pay: Math.round(netPay),
  };
};

/**
 * Compute full payroll run for all employees
 */
const computePayroll = (employees) => {
  const items = employees.map(computeEmployee);
  const totals = items.reduce((acc, item) => ({
    total_gross:   acc.total_gross   + item.gross_salary,
    total_paye:    acc.total_paye    + item.paye,
    total_pension: acc.total_pension + item.pension_employee,
    total_nhf:     acc.total_nhf     + item.nhf,
    total_net:     acc.total_net     + item.net_pay,
  }), { total_gross:0, total_paye:0, total_pension:0, total_nhf:0, total_net:0 });

  return { items, totals };
};

/**
 * Compute late filing penalty
 * FITA: 10% of tax + 5% per month thereafter (max 100%)
 * Interest: CBN MPR + 5% (using 21% as proxy)
 */
const computePenalty = (principal, daysLate, taxType = 'VAT') => {
  if (daysLate <= 0) return { penalty: 0, interest: 0, total: principal };
  const monthsLate = Math.ceil(daysLate / 30);
  const penaltyRate = taxType === 'CIT' ? 0.10 : 0.10;
  const additionalRate = Math.min(monthsLate * 0.05, 1.0);
  const totalPenaltyRate = penaltyRate + additionalRate;
  const penalty = Math.round(principal * totalPenaltyRate);
  const interestRate = 0.21 / 365;
  const interest = Math.round(principal * interestRate * daysLate);
  return {
    penalty,
    interest,
    total: principal + penalty + interest,
    penaltyRate: totalPenaltyRate,
    daysLate,
    monthsLate,
  };
};

module.exports = { computeEmployee, computePayroll, computePAYE, computePenalty };
