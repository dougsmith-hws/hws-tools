/* Manual-test capture for Job 2. Not part of the regression runner. */
const { chromium } = require('playwright');
const path = require('path');

const APP = 'file://' + path.resolve(process.argv[2] || 'index.html');

/* The pinned profile from tests/job1-whatif.test.js, at 6.875% conv per
   Implementation-Report Addendum B5. */
const PROFILE = {
  price: '499,900', score: '788', ownFunds: '200,000', gift: '0', dpTarget: '150,000',
  target: '3,000', income: '9,500', debts: '40', stay: '7', priority: 'balanced',
  rateConv: '6.875', rateFha: '6.250', rateVa: '6.125', ccPct: '3', ccOverride: '',
  taxRate: '582', hoi: '250', hoa: '0', cdd: '0', flood: '0',
  offerPrice: '', offerConc: '0', counterPrice: '', counterConc: '0'
};
const CHECKS = { hoaNA: true, cddNA: true, floodNA: true, tgFthb: false, tgVa: false, vaExempt: false };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 1400 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(APP);
  await page.evaluate(() => { unitState.tax = 'dollarMo'; unitState.dp = 'dollar'; renderUnitToggles(); });

  const set = async f => {
    await page.evaluate(a => {
      Object.keys(a.f).forEach(id => { const el = document.getElementById(id); if (el) el.value = a.f[id]; });
      Object.keys(a.c).forEach(id => { const el = document.getElementById(id); if (el) el.checked = !!a.c[id]; });
      unitState.dp = 'dollar'; unitState.tax = 'dollarMo';
      renderUnitToggles(); recalc();
    }, { f: f, c: CHECKS });
  };
  await set(PROFILE);

  const txt = id => page.evaluate(i => {
    const e = document.getElementById(i); return e ? (e.innerText || '') : null;
  }, id);

  console.log('================ SHOPPING RANGE (list price blank) ================');
  await set(Object.assign({}, PROFILE, { price: '' }));
  console.log(await txt('answerBody'));

  console.log('\n\n================ JOB 2 · $499,900 · payment goal ================');
  await set(PROFILE);
  console.log(await txt('answerHead'));
  console.log(await txt('answerBody'));
  await page.screenshot({ path: '/home/claude/out/job2-payment.png', fullPage: false });

  console.log('\n\n================ JOB 2 · CASH SHORT (funds $60,000) ================');
  await set(Object.assign({}, PROFILE, { ownFunds: '60,000', dpTarget: '' }));
  console.log(await txt('answerBody'));

  console.log('\n\n================ JOB 2 · ALREADY UNDER TARGET (target $5,000) ================');
  await set(Object.assign({}, PROFILE, { target: '5,000', dpTarget: '' }));
  console.log(await txt('answerBody'));

  console.log('\n\n================ JOB 2 · QUALIFICATION FAIL (income $5,000 debts $2,500) ================');
  await set(Object.assign({}, PROFILE, { income: '5,000', debts: '2,500', target: '3,000', ownFunds: '400,000', dpTarget: '' }));
  console.log(await txt('answerBody'));

  console.log('\n\n================ JOB 2 · seller value + debt payoff + rate ================');
  await set(Object.assign({}, PROFILE, { ownFunds: '200,000', dpTarget: '150,000', income: '11,000', debts: '400' }));
  await page.evaluate(() => {
    document.getElementById('offerPrice').value = '499,900';
    document.getElementById('offerConc').value = '10,000';
    recalc();
    answerUi.seller = true; answerUi.lever = true; answerUi.prate = true; answerUi.alt = true;
    debtList = [{ id: 1, label: 'Car loan', monthly: 450, balance: 32000, on: true }];
    recalc();
  });
  console.log(await txt('answerBody'));
  await page.screenshot({ path: '/home/claude/out/job2-strategy.png', fullPage: true });

  console.log('\n\nJS ERRORS: ' + (errs.length ? errs.join('\n') : 'none'));
  await browser.close();
})();
