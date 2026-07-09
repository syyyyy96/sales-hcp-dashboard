const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function classify(rxCost, paymentAmt, medRx, medPay) {
  const hiRx = rxCost >= medRx;
  const hiPay = paymentAmt >= medPay;
  if (hiRx && hiPay) return '고처방-고지급 (핵심 유지)';
  if (hiRx && !hiPay) return '고처방-저지급 (우선 타겟)';
  if (!hiRx && hiPay) return '고지급-저처방 (효율 재검토)';
  return '저처방-저지급';
}

async function main() {
  await client.connect();
  const q = async (sql) => (await client.query(sql)).rows;

  const [{ pdprescribers }] = await q('select count(distinct prscrbr_npi) pdprescribers from part_d_prescriber');
  const [{ oprecipients }] = await q('select count(distinct covered_recipient_npi) oprecipients from open_payments');
  const [{ commonnpis }] = await q(`
    select count(*) commonnpis from (
      select distinct prscrbr_npi as npi from part_d_prescriber
      intersect
      select distinct covered_recipient_npi as npi from open_payments
    ) x
  `);
  const [{ totalpayment }] = await q('select sum(payment_amount_usd) totalpayment from open_payments');
  const [{ totalrxcost }] = await q('select sum(tot_drug_cst) totalrxcost from part_d_prescriber');

  const natureRows = await q(`
    select payment_nature as nature, sum(payment_amount_usd) amt
    from open_payments group by payment_nature order by amt desc limit 8
  `);
  const natureTotals = natureRows.map((r) => ({ nature: r.nature, amt: round2(r.amt) }));

  async function apportioned(products) {
    const rows = await client.query(`
      with expanded as (
        select payment_amount_usd, payment_count,
          unnest(array[product_1,product_2,product_3,product_4,product_5]) as product,
          (case when product_1 is not null then 1 else 0 end
          +case when product_2 is not null then 1 else 0 end
          +case when product_3 is not null then 1 else 0 end
          +case when product_4 is not null then 1 else 0 end
          +case when product_5 is not null then 1 else 0 end) as nprod
        from open_payments
      )
      select product, sum(payment_amount_usd/nprod) amt, sum(payment_count) cnt
      from expanded where product = any($1::text[])
      group by product
    `, [products]);
    return Object.fromEntries(rows.rows.map((r) => [r.product, r]));
  }

  const rxByBrand = async (pattern) => {
    const r = await client.query(
      `select sum(tot_drug_cst) rxcost, sum(tot_clms) rxclms from part_d_prescriber where brnd_name like $1`,
      [pattern]
    );
    return r.rows[0];
  };

  const entrestoRx = await rxByBrand('Entresto');
  const cosentyxRx = await rxByBrand('Cosentyx%');
  const opPay = await apportioned(['ENTRESTO', 'COSENTYX']);

  const productComparison = [
    {
      product: 'ENTRESTO',
      rxCost: round2(entrestoRx.rxcost),
      rxClms: Number(entrestoRx.rxclms),
      paymentAmt: round2(opPay.ENTRESTO.amt),
      paymentCount: Number(opPay.ENTRESTO.cnt),
    },
    {
      product: 'COSENTYX',
      rxCost: round2(cosentyxRx.rxcost),
      rxClms: Number(cosentyxRx.rxclms),
      paymentAmt: round2(opPay.COSENTYX.amt),
      paymentCount: Number(opPay.COSENTYX.cnt),
    },
  ];

  const allProductsExpanded = await q(`
    with expanded as (
      select payment_amount_usd, payment_count,
        unnest(array[product_1,product_2,product_3,product_4,product_5]) as product,
        (case when product_1 is not null then 1 else 0 end
        +case when product_2 is not null then 1 else 0 end
        +case when product_3 is not null then 1 else 0 end
        +case when product_4 is not null then 1 else 0 end
        +case when product_5 is not null then 1 else 0 end) as nprod
      from open_payments
    )
    select product, sum(payment_amount_usd/nprod) amt, sum(payment_count) cnt
    from expanded where product is not null and product not in ('ENTRESTO','COSENTYX')
    group by product order by amt desc limit 20
  `);
  const opOnlyProducts = allProductsExpanded.map((r) => ({
    product: r.product, paymentAmt: round2(r.amt), paymentCount: Number(r.cnt),
  }));

  const cityRx = await q(`
    select prscrbr_city as city, sum(tot_drug_cst) rxcost
    from part_d_prescriber group by prscrbr_city order by rxcost desc limit 20
  `);
  const cityPayRows = await q(`
    with expanded as (
      select payment_amount_usd, recipient_city,
        unnest(array[product_1,product_2,product_3,product_4,product_5]) as product,
        (case when product_1 is not null then 1 else 0 end
        +case when product_2 is not null then 1 else 0 end
        +case when product_3 is not null then 1 else 0 end
        +case when product_4 is not null then 1 else 0 end
        +case when product_5 is not null then 1 else 0 end) as nprod
      from open_payments
    )
    select recipient_city as city, sum(payment_amount_usd/nprod) amt
    from expanded where product in ('ENTRESTO','COSENTYX')
    group by recipient_city
  `);
  const cityPayMap = Object.fromEntries(cityPayRows.map((r) => [r.city, Number(r.amt)]));
  const cityComparison = cityRx.map((r) => ({
    city: r.city,
    rxCost: round2(r.rxcost),
    paymentAmt: round2(cityPayMap[r.city] || 0),
  }));

  const rxPerNpi = await q(`
    select prscrbr_npi as npi, sum(tot_drug_cst) rxcost, sum(tot_clms) rxclms,
      max(prscrbr_last_org_name) as last_name, max(prscrbr_first_name) as first_name,
      max(prscrbr_city) as city, max(prscrbr_type) as spec
    from part_d_prescriber group by prscrbr_npi
  `);
  const payPerNpi = await q(`
    select covered_recipient_npi as npi, sum(payment_amount_usd) paymentamt, sum(payment_count) paymentcount
    from open_payments group by covered_recipient_npi
  `);
  const payMap = Object.fromEntries(payPerNpi.map((r) => [String(r.npi), r]));

  const commonNpiRows = await q(`
    select distinct prscrbr_npi as npi from part_d_prescriber
    intersect
    select distinct covered_recipient_npi as npi from open_payments
  `);
  const commonSet = new Set(commonNpiRows.map((r) => String(r.npi)));

  const commonList = rxPerNpi
    .filter((r) => commonSet.has(String(r.npi)))
    .map((r) => ({
      npi: String(r.npi),
      name: `${r.last_name}, ${r.first_name}`,
      city: r.city,
      spec: r.spec,
      rxCost: round2(r.rxcost),
      rxClms: Number(r.rxclms),
      paymentAmt: round2(payMap[String(r.npi)].paymentamt),
      paymentCount: Number(payMap[String(r.npi)].paymentcount),
    }));

  const rxCosts = commonList.map((r) => r.rxCost).sort((a, b) => a - b);
  const paymentAmts = commonList.map((r) => r.paymentAmt).sort((a, b) => a - b);
  const median = (arr) => {
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
  };
  const medRx = median(rxCosts);
  const medPay = median(paymentAmts);

  const targets = commonList.map((r) => ({ ...r, segment: classify(r.rxCost, r.paymentAmt, medRx, medPay) }));

  const segmentCounts = {};
  for (const t of targets) segmentCounts[t.segment] = (segmentCounts[t.segment] || 0) + 1;

  const rxOnlyTop = rxPerNpi
    .filter((r) => !commonSet.has(String(r.npi)))
    .sort((a, b) => Number(b.rxcost) - Number(a.rxcost))
    .slice(0, 150)
    .map((r) => ({
      npi: String(r.npi),
      name: `${r.last_name}, ${r.first_name}`,
      city: r.city,
      spec: r.spec,
      rxCost: round2(r.rxcost),
      rxClms: Number(r.rxclms),
      paymentAmt: 0,
      paymentCount: 0,
      segment: '미접촉 고처방 (지급이력 없음)',
    }));

  const overview = {
    pdPrescribers: Number(pdprescribers),
    opRecipients: Number(oprecipients),
    commonNpis: Number(commonnpis),
    matchRate: Math.round((Number(commonnpis) / Number(pdprescribers)) * 1000) / 10,
    totalPayment: round2(totalpayment),
    totalRxCost: round2(totalrxcost),
    natureTotals,
    segmentCounts,
  };

  const dashboardData = { overview, productComparison, opOnlyProducts, cityComparison, targets, rxOnlyTop };

  await client.query(`
    create table if not exists dashboard_data (
      id int primary key default 1,
      payload jsonb not null,
      updated_at timestamptz not null default now(),
      constraint single_row check (id = 1)
    );
    alter table dashboard_data enable row level security;
  `);
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_policies where tablename = 'dashboard_data' and policyname = 'anon read dashboard_data') then
        create policy "anon read dashboard_data" on dashboard_data for select to anon using (true);
      end if;
    end $$;
  `);
  await client.query(
    `insert into dashboard_data (id, payload, updated_at) values (1, $1, now())
     on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
    [JSON.stringify(dashboardData)]
  );

  console.log('overview:', overview);
  console.log('targets count:', targets.length, 'rxOnlyTop count:', rxOnlyTop.length);
  console.log('Saved to dashboard_data table.');

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
