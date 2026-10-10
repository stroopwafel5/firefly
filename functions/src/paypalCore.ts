/** PayPal Orders v2 request building (pure, used by paypal.ts and scripts/checkApis.ts). */

export const PAYPAL_RETURN_URL = 'https://www.differentroute.net/?firefly=paypal-return';
export const PAYPAL_CANCEL_URL = 'https://www.differentroute.net/?firefly=paypal-cancel';

export const paypalBase = (env: string) => (env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

export function paypalTokenRequest(env: string, clientId: string, clientSecret: string): [string, RequestInit] {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return [
    `${paypalBase(env)}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    },
  ];
}

export function paypalOrderBody(bookingId: string, campName: string, price: number) {
  return {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: bookingId,
        description: `Different Route — ${campName}`.slice(0, 127),
        amount: { currency_code: 'EUR', value: price.toFixed(2) },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: 'Different Route',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: PAYPAL_RETURN_URL,
          cancel_url: PAYPAL_CANCEL_URL,
        },
      },
    },
  };
}

/** PayPal's approval link from a create-order response ("payer-action" for payment_source orders). */
export function approveLink(order: { links?: Array<{ rel: string; href: string }> }): string | undefined {
  return order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
}
