import { ApiClient } from "./src/mod.ts";
const apiClient = await ApiClient.generateFrom({
  apiName: "inventory",
  clientFilePath: "temp/",
  url:
    "https://developer.ebay.com/api-docs/master/sell/inventory/openapi/3/sell_inventory_v1_oas3.json",
});
apiClient.writeApiClient();
