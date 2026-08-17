import { expect, test } from '../../fixtures';

test(
  'SD-1-01 · Adding a product to the cart updates the cart badge @smoke @cart',
  {
    annotation: [{ type: 'practitest', description: 'SD-1-01' }],
  },
  async ({ authedPage, inventory }) => {
    await inventory.open(authedPage);
    const [first] = await inventory.productNames(authedPage);

    await inventory.addToCart(authedPage, first!);

    expect(await inventory.cartCount(authedPage)).toBe(1);
  },
);
