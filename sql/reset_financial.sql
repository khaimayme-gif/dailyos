-- Wipes all financial data (keeps categories). Run in the Supabase SQL editor.
-- Cannot be undone.
delete from debt_payments;
delete from planned_debt_payments;
delete from debts;
delete from obligations;
delete from expenses;
delete from incomes;
update balances set cash = 0, bank = 0 where id = 1;
