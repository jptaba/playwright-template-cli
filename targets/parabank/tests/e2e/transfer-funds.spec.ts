import { expect, test } from '../../fixtures';

/**
 * PB-1 — moving money between two of your own accounts.
 *
 * **Every assertion here is relative, and that is forced by the application.**
 * `john` is shared with everybody on the internet, so the balances move while
 * a run is in flight — an absolute figure would pass on a quiet afternoon and
 * fail for a reason unrelated to what it proves. The claim is about what *this
 * transfer* did, not about what the account holds.
 */
test(
  'PB-1-01 · A transfer between two accounts is confirmed with its amount @smoke @accounts',
  {
    annotation: [
      { type: 'practitest', description: 'PB-1-01' },
      { type: 'jira', description: 'PB-1' },
    ],
  },
  async ({ authedPage, banking }) => {
    await banking.openOverview(authedPage);
    const held = await banking.accountNumbers(authedPage);

    /*
       Stated rather than assumed. A customer with one account cannot transfer
       between two, and the failure would otherwise land inside the transfer
       verb as an unhelpful "option not found".
    */
    expect(held.length, 'this customer holds fewer than two accounts to transfer between')
      .toBeGreaterThan(1);

    const [from, to] = held;
    const receipt = await banking.transfer(authedPage, { amount: '1.00', from: from!, to: to! });

    expect(receipt.completed, `the transfer was refused: ${receipt.message}`).toBe(true);
    // The confirmation is the application's own account of what it did, so it
    // is what the case checks — the amount, and both accounts by number.
    expect(receipt.message).toContain('$1.00');
    expect(receipt.message).toContain(from!);
    expect(receipt.message).toContain(to!);
  },
);
