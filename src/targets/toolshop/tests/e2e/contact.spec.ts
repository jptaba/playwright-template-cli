import { expect, test } from '../../fixtures';

/**
 * L4 — the contact form.
 */

test(
  'TS-E35 · An empty enquiry reports a problem against every required field @contact',
  { annotation: [{ type: 'practitest', description: '9035' }] },
  async ({ authedPage, contact }) => {
    await contact.open(authedPage);

    await contact.submitEmpty(authedPage);

    expect(await contact.fieldError(authedPage, 'subject')).not.toBeNull();
    expect(await contact.fieldError(authedPage, 'message')).not.toBeNull();
  },
);

test(
  'TS-E36 · A customer enquiry is accepted and confirmed @contact',
  { annotation: [{ type: 'practitest', description: '9036' }] },
  async ({ authedPage, contact, testData }) => {
    await contact.open(authedPage);

    await contact.send(authedPage, testData.enquiry());

    expect(await contact.readConfirmation(authedPage)).toContain('Thanks for your message');
  },
);

test(
  'TS-E37 · The enquiry form offers the subjects this deployment handles @contact',
  { annotation: [{ type: 'practitest', description: '9037' }] },
  async ({ authedPage, contact }) => {
    await contact.open(authedPage);

    const subjects = await contact.readSubjects(authedPage);

    expect(subjects).toContain('Customer service');
    expect(subjects.length).toBeGreaterThan(1);
  },
);
