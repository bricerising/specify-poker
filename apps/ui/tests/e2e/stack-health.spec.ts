import { expect, test } from "@playwright/test";
import { urls } from "./helpers/urls";
import { expectHealthy } from "./helpers/http";

test.describe("Quickstart Stack Health", () => {
  test.setTimeout(60_000);

  test("exposes the documented local URLs", async ({ request }) => {
    await expectHealthy(request);

    const ui = await request.get(urls.ui);
    expect(ui.ok()).toBeTruthy();

    const gatewayHealth = await request.get(`${urls.gateway}/health`);
    expect(gatewayHealth.ok()).toBeTruthy();

    const keycloakRealm = await request.get(`${urls.keycloak}/realms/poker-local`);
    expect(keycloakRealm.ok()).toBeTruthy();

    const prometheus = await request.get(urls.prometheus);
    expect(prometheus.ok()).toBeTruthy();

    const grafana = await request.get(`${urls.grafana}/api/health`);
    expect(grafana.ok()).toBeTruthy();

    const loki = await request.get(`${urls.loki}/ready`);
    expect(loki.ok()).toBeTruthy();

    const tempo = await request.get(`${urls.tempo}/ready`);
    expect(tempo.ok()).toBeTruthy();
  });
});
