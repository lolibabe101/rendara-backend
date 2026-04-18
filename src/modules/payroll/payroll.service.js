const db = require('../../config/db');
const { computePayroll } = require('./payroll.engine');

// ── EMPLOYEES ─────────────────────────────────────────────────
const listEmployees = async (businessId) => {
  const { rows } = await db.query(
    `SELECT * FROM employees WHERE business_id = $1 AND is_active = TRUE ORDER BY last_name, first_name`,
    [businessId]
  );
  return rows;
};

const createEmployee = async (businessId, data) => {
  const { rows } = await db.query(
    `INSERT INTO employees (business_id, first_name, last_name, email, phone, designation,
      department, gross_salary, basic_salary, housing, transport, pension_rate, nhf_rate,
      bank_name, account_number, tax_id, date_employed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [businessId, data.firstName, data.lastName, data.email||null, data.phone||null,
     data.designation||null, data.department||null, data.grossSalary,
     data.basicSalary||null, data.housing||null, data.transport||null,
     data.pensionRate||8, data.nhfRate||2.5, data.bankName||null,
     data.accountNumber||null, data.taxId||null, data.dateEmployed||null]
  );
  return rows[0];
};

const updateEmployee = async (businessId, id, data) => {
  const { rows } = await db.query(
    `UPDATE employees SET
       first_name = COALESCE($1, first_name),
       last_name = COALESCE($2, last_name),
       designation = COALESCE($3, designation),
       department = COALESCE($4, department),
       gross_salary = COALESCE($5, gross_salary),
       basic_salary = COALESCE($6, basic_salary),
       housing = COALESCE($7, housing),
       transport = COALESCE($8, transport),
       pension_rate = COALESCE($9, pension_rate),
       bank_name = COALESCE($10, bank_name),
       account_number = COALESCE($11, account_number)
     WHERE id = $12 AND business_id = $13 RETURNING *`,
    [data.firstName||null, data.lastName||null, data.designation||null,
     data.department||null, data.grossSalary??null, data.basicSalary??null,
     data.housing??null, data.transport??null, data.pensionRate??null,
     data.bankName||null, data.accountNumber||null, id, businessId]
  );
  return rows[0];
};

const deactivateEmployee = async (businessId, id) => {
  await db.query('UPDATE employees SET is_active = FALSE WHERE id = $1 AND business_id = $2', [id, businessId]);
};

// ── PAYROLL RUNS ──────────────────────────────────────────────
const runPayroll = async (businessId, userId, { payPeriod, runDate }) => {
  const employees = await listEmployees(businessId);
  if (!employees.length) {
    const err = new Error('No active employees found');
    err.statusCode = 400;
    throw err;
  }

  const { items, totals } = computePayroll(employees);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO payroll_runs (business_id, pay_period, run_date, total_gross, total_paye,
        total_pension, total_nhf, total_net, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [businessId, payPeriod, runDate || new Date().toISOString().split('T')[0],
       totals.total_gross, totals.total_paye, totals.total_pension,
       totals.total_nhf, totals.total_net, userId]
    );
    const run = rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO payroll_items (payroll_run_id, employee_id, gross_salary, basic, housing,
          transport, gross_income, cra, pension_employee, nhf, taxable_income, paye, net_pay)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [run.id, item.employee_id, item.gross_salary, item.basic, item.housing,
         item.transport, item.gross_income, item.cra, item.pension_employee,
         item.nhf, item.taxable_income, item.paye, item.net_pay]
      );
    }

    await client.query('COMMIT');
    return { run, items, totals };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const getPayrollRun = async (businessId, runId) => {
  const { rows } = await db.query(
    `SELECT pr.*, json_agg(
       json_build_object(
         'item', pi.*,
         'employee', json_build_object('first_name', e.first_name, 'last_name', e.last_name,
           'designation', e.designation, 'bank_name', e.bank_name, 'account_number', e.account_number)
       )
     ) as line_items
     FROM payroll_runs pr
     JOIN payroll_items pi ON pi.payroll_run_id = pr.id
     JOIN employees e ON e.id = pi.employee_id
     WHERE pr.id = $1 AND pr.business_id = $2
     GROUP BY pr.id`,
    [runId, businessId]
  );
  return rows[0];
};

const listPayrollRuns = async (businessId) => {
  const { rows } = await db.query(
    `SELECT * FROM payroll_runs WHERE business_id = $1 ORDER BY pay_period DESC LIMIT 24`,
    [businessId]
  );
  return rows;
};

const filePayroll = async (businessId, runId, reference) => {
  const { rows } = await db.query(
    `UPDATE payroll_runs SET status = 'filed', filed_at = NOW(), lirs_reference = $1
     WHERE id = $2 AND business_id = $3 RETURNING *`,
    [reference || null, runId, businessId]
  );
  return rows[0];
};

module.exports = { listEmployees, createEmployee, updateEmployee, deactivateEmployee,
                   runPayroll, getPayrollRun, listPayrollRuns, filePayroll };
