import { expect, test } from '../../fixtures';

/**
 * PB-2 to PB-6 — the four coverage kinds beyond the happy path (§08 stage 3).
 *
 * **Two of these fail, and that is the finding rather than a problem with
 * them.** ParaBank accepts a transfer of a negative amount and a transfer far
 * larger than the account holds, reporting *"Transfer Complete!"* for both —
 * measured against the running application before either was written. The
 * conventions are explicit: a defect in the application is a failure and it
 * stays one, so these assert the behaviour a bank must have and are left
 * failing.
 *
 * **They were briefly marked `test.fail()` and it was withdrawn**, which is
 * worth recording because the reason is not style. `test.fail()` inverts the
 * whole test, so a spec that never reaches its own assertion — because the
 * application is answering HTTP 500 two pages earlier, which ParaBank also
 * does — is reported as a *pass*. A known-failure marker that cannot tell
 * "the defect is still there" from "this stopped testing anything" is the
 * failure mode run 56 recorded for ground-truth fixtures, in a different
 * costume. §10 says the same thing: known-failure handling belongs in triage
 * and the report, never in the code under the assertion.
 *
 * **Every claim here is about a change, never about a total.** This demo is
 * shared with strangers and keeps every transfer anybody has ever made, so
 * "there is one transaction of this amount" is a claim about other people's
 * data. "There is one *more* than before" is a claim about ours.
 */

test(
  'PB-2-01 · A transfer of a negative amount is refused @negative @accounts',
  {
    annotation: [
      { type: 'practitest', description: 'PB-2-01' },
      { type: 'jira', description: 'PB-2' },
    ],
  },
  async ({ authedPage, banking }) => {
    /*
       Left failing because the application has the defect, not because the
       assertion is wrong. Measured: `-5` is accepted and the
       page answers *"Transfer Complete! -$5.00 has been transferred"*. An
       empty amount and the string `abc` are accepted too, and both report a
       completed transfer with no amount in it at all.

       Left asserting the correct behaviour on purpose. Loosening it to match
       what the application does would turn a finding into silence, and the day
       ParaBank fixes this the spec starts passing and says so.
    */
    await banking.openOverview(authedPage);
    const [from, to] = await banking.accountNumbers(authedPage);
    expect(from, 'two accounts are needed to transfer between').toBeDefined();
    expect(to).toBeDefined();

    // Small, because on an application that accepts it this really moves.
    const receipt = await banking.transfer(authedPage, { amount: '-0.01', from: from!, to: to! });

    expect(receipt.completed, `a bank accepted a negative transfer: ${receipt.message}`).toBe(
      false,
    );
  },
);

test(
  'PB-3-01 · Reloading a completed transfer does not make it twice @idempotency @accounts',
  {
    annotation: [
      { type: 'practitest', description: 'PB-3-01' },
      { type: 'jira', description: 'PB-3' },
    ],
  },
  async ({ authedPage, banking, testData }) => {
    /*
       The classic form-resubmission defect, asked of a bank where it would
       cost somebody money. Measured first: the confirmation page returns to an
       empty Transfer Funds form on reload rather than re-posting, so this is a
       guarantee the application actually makes and the spec pins it.

       Counted on the destination account rather than read off the confirmation
       — the confirmation is the page that made the change agreeing with
       itself, and a second post would produce a second *record*, which is the
       thing worth being sure about.
    */
    const amount = testData.transferAmount();
    await banking.openOverview(authedPage);
    const [from, to] = await banking.accountNumbers(authedPage);
    expect(to, 'two accounts are needed to transfer between').toBeDefined();

    const before = (await banking.activity(authedPage, to!)).filter(
      (row) => row.amount === Number(amount),
    ).length;

    const receipt = await banking.transfer(authedPage, { amount, from: from!, to: to! });
    expect(receipt.completed, receipt.message).toBe(true);

    await authedPage.reload();

    const after = (await banking.activity(authedPage, to!)).filter(
      (row) => row.amount === Number(amount),
    ).length;

    expect(after, 'the reload posted the transfer a second time').toBe(before + 1);
  },
);

test(
  'PB-4-01 · A completed transfer is recorded on the account that received it @audit @accounts',
  {
    annotation: [
      { type: 'practitest', description: 'PB-4-01' },
      { type: 'jira', description: 'PB-4' },
    ],
  },
  async ({ authedPage, banking, testData }) => {
    /*
       The audit claim, and the second surface is a real one: the transfer is
       made on the transfer form and the question is asked of the *receiving
       account's* activity page, which the application renders from what it
       recorded. A spec that read the confirmation back would only have proved
       the page agrees with itself.

       The description is asserted as well as the amount. An amount alone would
       be satisfied by any transaction that happened to be for the same money —
       a fee, somebody else's transfer — and this demo has plenty of both.
    */
    const amount = testData.transferAmount();
    await banking.openOverview(authedPage);
    const [from, to] = await banking.accountNumbers(authedPage);
    expect(to, 'two accounts are needed to transfer between').toBeDefined();

    const before = (await banking.activity(authedPage, to!)).filter(
      (row) => row.amount === Number(amount),
    ).length;

    await banking.transfer(authedPage, { amount, from: from!, to: to! });

    const recorded = (await banking.activity(authedPage, to!)).filter(
      (row) => row.amount === Number(amount),
    );

    expect(recorded.length, 'the transfer reached no record on the receiving account').toBe(
      before + 1,
    );
    expect(
      recorded.some((row) => /transfer/i.test(row.description)),
      'a transaction of the right amount, but nothing says it was a transfer',
    ).toBe(true);
  },
);

test(
  'PB-6-01 · A transfer larger than the account holds is refused @boundary @accounts',
  {
    annotation: [
      { type: 'practitest', description: 'PB-6-01' },
      { type: 'jira', description: 'PB-6' },
    ],
  },
  async ({ authedPage, banking }) => {
    /*
       The upper bound a bank account has, which is its balance. Measured:
       ParaBank accepts `999999999` and answers *"Transfer Complete!
       $999999999.00 has been transferred"* — so the account has no ceiling at
       all, which is the same defect family as PB-2-01 and is left failing for
       the same reason.

       **Both halves, and the passing one comes first on purpose.** A spec that
       only showed an enormous amount refused would be satisfied by an
       application that refused everything, so the ordinary transfer above the
       assertion is what proves the range is real. It runs, it succeeds, and
       then the ceiling is asked about.
    */
    await banking.openOverview(authedPage);
    const [from, to] = await banking.accountNumbers(authedPage);
    expect(from, 'two accounts are needed to transfer between').toBeDefined();

    const ordinary = await banking.transfer(authedPage, {
      amount: '1.00',
      from: from!,
      to: to!,
    });
    expect(ordinary.completed, 'an ordinary transfer was refused, so nothing here is a bound').toBe(
      true,
    );

    const beyond = await banking.transfer(authedPage, {
      amount: '999999999',
      from: from!,
      to: to!,
    });

    expect(beyond.completed, `a bank moved money it does not have: ${beyond.message}`).toBe(false);
  },
);
