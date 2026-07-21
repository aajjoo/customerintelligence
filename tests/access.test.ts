// Tests für Rechteprüfung (Konventionen: verpflichtend) – reine Funktionen ohne DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeAllCustomers, customerWhereForUser, isAllowedEmail } from "../src/lib/access.ts";

test("isAllowedEmail: nur erlaubte Domain", () => {
  assert.equal(isAllowedEmail("albert.ortig@netural.com", "netural.com"), true);
  assert.equal(isAllowedEmail("a.b@NETURAL.COM", "netural.com"), true);
  assert.equal(isAllowedEmail("wer@extern.at", "netural.com"), false);
  // Teilstring reicht nicht: fremde Domain mit gleichem Suffix-Anteil
  assert.equal(isAllowedEmail("x@nichtnetural.com", "netural.com"), false);
  assert.equal(isAllowedEmail(null, "netural.com"), false);
  assert.equal(isAllowedEmail("", "netural.com"), false);
  // ohne konfigurierte Restriktion keine Ablehnung
  assert.equal(isAllowedEmail("wer@extern.at", undefined), true);
});

test("canSeeAllCustomers: nur Management und Admin", () => {
  assert.equal(canSeeAllCustomers("management"), true);
  assert.equal(canSeeAllCustomers("admin"), true);
  assert.equal(canSeeAllCustomers("lead"), false);
  assert.equal(canSeeAllCustomers("member"), false);
});

test("customerWhereForUser: Teammitglieder nur zugeordnete Kunden", () => {
  assert.deepEqual(customerWhereForUser("u1", "member"), {
    memberships: { some: { userId: "u1" } },
  });
  assert.deepEqual(customerWhereForUser("u1", "lead"), {
    memberships: { some: { userId: "u1" } },
  });
  assert.deepEqual(customerWhereForUser("u1", "management"), {});
  assert.deepEqual(customerWhereForUser("u1", "admin"), {});
});
