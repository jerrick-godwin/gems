import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCampaign, validateModeration } from './admin-validation.js';
import { paymentOrigin } from './payment-origin.js';
const campaign = { id: 'c1', type: 'featured' as const, status: 'active' as const, startsAt: '2030-01-01T00:00:00Z', endsAt: '2030-01-08T00:00:00Z' };
test('campaign validation rejects invalid types, states, dates and identity changes', () => {
  for (const patch of [{type:'anything'}, {status:'anything'}, {endsAt:'invalid'}, {endsAt:campaign.startsAt}]) assert.throws(() => validateCampaign({...campaign,...patch} as any));
  assert.throws(() => validateCampaign({...campaign,id:'other'},campaign));
  assert.throws(() => validateCampaign({...campaign,endsAt:'2030-01-02T00:00:00Z'},campaign));
  assert.throws(() => validateCampaign(campaign,{...campaign,status:'stopped'}));
  assert.equal(validateCampaign({...campaign,status:'paused'},campaign).status,'paused');
});
test('moderation rejection requires a reason', () => {
  assert.throws(() => validateModeration('reject','  '));
  assert.throws(() => validateModeration('unknown'));
  assert.doesNotThrow(() => validateModeration('reject','Wrong certificate'));
});
test('payment origins fail closed in production', () => {
  for (const url of [undefined, 'http://example.com', 'https://localhost', 'https://example.com/path', 'https://user:pass@example.com']) assert.throws(() => paymentOrigin(url,true));
  assert.equal(paymentOrigin('https://example.com/',true),'https://example.com');
  assert.equal(paymentOrigin(undefined,false),'http://localhost:4100');
});
