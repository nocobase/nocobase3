// @vitest-environment node
import { expect, it } from 'vitest';
import client from '../client/index.js';
import server from '../server/index.js';

it('provides services without owning collections, resource routes, pages or locales', () => {
  expect(server.serviceProviders).toHaveLength(1);
  expect(server.routes).toEqual([]);
  expect(server.database).toBeUndefined();
  const registration = client();
  expect(registration.serviceProviders).toHaveLength(1);
  expect(registration.routes).toEqual([]);
  expect(registration.locales).toBeUndefined();
});
